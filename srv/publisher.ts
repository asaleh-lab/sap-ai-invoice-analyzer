import cds from "@sap/cds";
import type { IncomingMessage, ServerResponse } from "node:http";

const createdType = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";
const firstPublished = 5100004001;
const fiscalYear = "2026";

type Row = Record<string, unknown>;

type Where = {
  where(filter: Record<string, unknown>): Promise<Row | Row[] | null>;
};

type Sql = {
  INSERT: { into(entity: string): { entries(row: Row): Promise<unknown> } };
  SELECT: { one: { from(entity: string): Where }; from(entity: string): Where };
};

type CdsRuntime = {
  tx<T>(fn: () => Promise<T>): Promise<T>;
  ql: Sql;
  utils: { uuid(): string };
};

const runtime = cds as unknown as CdsRuntime;
const { INSERT, SELECT } = runtime.ql;

type TemplateName = "price" | "quantity" | "matching" | "unblocked";

type Template = {
  scenario: string;
  itemAmount: number;
  quantity: number;
  poNet: number;
  poQuantity: number;
  receiptQuantity: number;
  block: string;
  gross: number;
};

const templates: Record<TemplateName, Template> = {
  price: {
    scenario: "Price variance",
    itemAmount: 100,
    quantity: 10,
    poNet: 8,
    poQuantity: 10,
    receiptQuantity: 10,
    block: "A",
    gross: 119,
  },
  quantity: {
    scenario: "Quantity variance",
    itemAmount: 80,
    quantity: 10,
    poNet: 8,
    poQuantity: 10,
    receiptQuantity: 8,
    block: "A",
    gross: 95.2,
  },
  matching: {
    scenario: "Matching documents with a payment block",
    itemAmount: 80,
    quantity: 10,
    poNet: 8,
    poQuantity: 10,
    receiptQuantity: 10,
    block: "A",
    gross: 95.2,
  },
  unblocked: {
    scenario: "Created event with no payment block",
    itemAmount: 80,
    quantity: 10,
    poNet: 8,
    poQuantity: 10,
    receiptQuantity: 10,
    block: "",
    gross: 95.2,
  },
};

export function registerPublisher(app: {
  post(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
}): void {
  app.post("/publisher/invoices", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      void publish(Buffer.concat(chunks).toString("utf8"))
        .then((body) => {
          reply(res, 201, body);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "The invoice was not published.";
          const status = message.startsWith("Unknown") ? 400 : 500;
          reply(res, status, { error: { code: status === 400 ? "BAD_REQUEST" : "FAILED", message } });
        });
    });
  });
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function publish(raw: string): Promise<Row> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Unknown template.");
  }
  const name = (parsed as Row).template;
  if (name !== "price" && name !== "quantity" && name !== "matching" && name !== "unblocked") {
    throw new Error("Unknown template.");
  }
  const template = templates[name];
  const supplier = await nextSupplier();
  const invoice = await nextInvoice();
  const suffix = invoice.slice(2);
  const purchaseOrder = `45${suffix}`;
  const receipt = `50${suffix}`;
  const eventId = runtime.utils.uuid();

  await runtime.tx(async () => {
    await INSERT.into("sap.sim.PurchaseOrders").entries({
      PurchaseOrder: purchaseOrder,
      Supplier: supplier,
      CompanyCode: "1010",
      DocumentCurrency: "EUR",
      items: [
        {
          PurchaseOrderItem: "10",
          Material: "FASTENER-M8",
          OrderQuantity: template.poQuantity,
          PurchaseOrderQuantityUnit: "PC",
          NetPriceAmount: template.poNet,
          NetPriceQuantity: 1,
        },
      ],
    });
    await INSERT.into("sap.sim.MaterialDocuments").entries({
      MaterialDocument: receipt,
      MaterialDocumentYear: fiscalYear,
      PostingDate: "2026-11-03",
      GoodsMovementCode: "01",
      ReferenceDocument: purchaseOrder,
      items: [
        {
          MaterialDocumentItem: "1",
          GoodsMovementType: "101",
          GoodsMovementRefDocType: "B",
          PurchaseOrder: purchaseOrder,
          PurchaseOrderItem: "10",
          QuantityInEntryUnit: template.receiptQuantity,
          EntryUnit: "PC",
          Material: "FASTENER-M8",
          Plant: "1010",
        },
      ],
    });
    await INSERT.into("sap.sim.SupplierInvoices").entries({
      SupplierInvoice: invoice,
      FiscalYear: fiscalYear,
      CompanyCode: "1010",
      DocumentDate: "2026-11-03",
      PostingDate: "2026-11-03",
      InvoicingParty: supplier,
      SupplierInvoiceIDByInvcgParty: `PUB-${invoice.slice(-4)}`,
      DocumentCurrency: "EUR",
      InvoiceGrossAmount: template.gross,
      PaymentBlockingReason: template.block,
      SupplierInvoiceStatus: "5",
      SupplierInvoiceIsCreditMemo: "",
      TaxIsCalculatedAutomatically: true,
      items: [
        {
          SupplierInvoiceItem: "1",
          PurchaseOrder: purchaseOrder,
          PurchaseOrderItem: "10",
          Plant: "1010",
          DocumentCurrency: "EUR",
          SupplierInvoiceItemAmount: template.itemAmount,
          QuantityInPurchaseOrderUnit: template.quantity,
          PurchaseOrderQuantityUnit: "PC",
          ReferenceDocument: receipt,
          ReferenceDocumentFiscalYear: fiscalYear,
          ReferenceDocumentItem: "1",
          IsSubsequentDebitCredit: "",
        },
      ],
    });
  });

  const posted = await postEvent(eventId, invoice);
  if (posted.status !== 202) throw new Error("The created event was not accepted.");
  const inbox = await waitInbox(eventId);
  if (inbox.status === "invalid" || inbox.status === "received") {
    throw new Error("The created event was not a valid invoice event.");
  }
  const cases = (await SELECT.from("invc.Investigations").where({
    supplierInvoice: invoice,
    fiscalYear,
  })) as unknown as Row[];
  return {
    scenario: template.scenario,
    supplierInvoice: invoice,
    fiscalYear,
    caseOpened: cases.length > 0,
    inboxStatus: inbox.status,
    invoicingParty: supplier,
    workbench: "/workbench-ui",
  };
}

async function nextSupplier(): Promise<string> {
  const partners = (await SELECT.from("sap.sim.BusinessPartners")) as unknown as Row[];
  const invoices = (await SELECT.from("sap.sim.SupplierInvoices")) as unknown as Row[];
  const ids = partners
    .map((row) => String(row.BusinessPartner))
    .filter((id) => id !== "")
    .sort();
  let chosen = ids[0] ?? "";
  let lowest = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const count = invoices.filter(
      (row) => String(row.InvoicingParty) === id && Number(row.SupplierInvoice) >= firstPublished,
    ).length;
    if (count < lowest) {
      lowest = count;
      chosen = id;
    }
  }
  return chosen;
}

async function nextInvoice(): Promise<string> {
  const rows = (await SELECT.from("sap.sim.SupplierInvoices")) as unknown as Row[];
  const highest = rows.reduce((max, row) => {
    const value = Number(row.SupplierInvoice);
    return value >= firstPublished && value > max ? value : max;
  }, firstPublished - 1);
  return String(highest + 1);
}

async function postEvent(id: string, invoice: string): Promise<{ status: number }> {
  const port = process.env.PORT || "4004";
  const response = await fetch(`http://127.0.0.1:${port}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      specversion: "1.0",
      id,
      source: "local/demo/simulated-s4",
      type: createdType,
      time: new Date().toISOString(),
      datacontenttype: "application/json",
      subject: `${invoice}/${fiscalYear}`,
      data: {
        SupplierInvoice: invoice,
        FiscalYear: fiscalYear,
        SupplierInvoiceFiscalYear: fiscalYear,
      },
    }),
  });
  return { status: response.status };
}

async function waitInbox(id: string): Promise<Row> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const row = (await SELECT.one.from("invc.EventInbox").where({ id })) as Row | null;
    if (row && row.status !== "received") return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The created event was not a valid invoice event.");
}
