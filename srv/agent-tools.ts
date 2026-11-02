import cds from "@sap/cds";

type Row = Record<string, unknown>;

type ToolRequest = {
  data: Record<string, string | null | undefined>;
  _: { res: { status(code: number): { json(body: unknown): void } } };
};

type Query = {
  SELECT: {
    one: { from(entity: string): QueryChain };
    from(entity: string): QueryChain;
  };
};

type QueryChain = {
  columns(...args: unknown[]): QueryChain;
  where(filter: Record<string, unknown>): QueryChain;
  limit(n: number): QueryChain;
};

const api = cds as unknown as {
  ApplicationService: new () => {
    init(): Promise<unknown>;
    on(event: string, handler: (req: ToolRequest) => Promise<string | void>): void;
  };
  ql: Query;
};

const { SELECT } = api.ql;

export default class AgentToolService extends api.ApplicationService {
  override async init(): Promise<void> {
    this.on("getSupplierInvoice", (req) => readSupplierInvoice(req));
    this.on("getPurchaseOrder", (req) => readPurchaseOrder(req));
    this.on("getGoodsReceipts", (req) => readGoodsReceipts(req));
    this.on("getSupplierInvoiceHistory", (req) => readInvoiceHistory(req));
    this.on("getSupplierBusinessPartner", (req) => readBusinessPartner(req));
    this.on("calculateInvoiceVariance", (req) => readVariance(req));
    await super.init();
  }
}

// API_SUPPLIERINVOICE_PROCESS_SRV: GET A_SupplierInvoice with to_SuplrInvcItemPurOrdRef.
async function readSupplierInvoice(req: ToolRequest): Promise<string | void> {
  const supplierInvoice = required(req, "SupplierInvoice");
  const fiscalYear = required(req, "FiscalYear");
  if (!supplierInvoice || !fiscalYear) return;
  const row = await loadInvoice(supplierInvoice, fiscalYear);
  if (!row) return notFound(req, `Supplier invoice ${supplierInvoice}/${fiscalYear} was not found in the simulated S/4 data.`);
  return json(invoiceDocument(row, true));
}

// API_PURCHASEORDER_PROCESS_SRV: GET A_PurchaseOrder with to_PurchaseOrderItem.
async function readPurchaseOrder(req: ToolRequest): Promise<string | void> {
  const purchaseOrder = required(req, "PurchaseOrder");
  if (!purchaseOrder) return;
  const row = await loadPurchaseOrder(purchaseOrder);
  if (!row) return notFound(req, `Purchase order ${purchaseOrder} was not found in the simulated S/4 data.`);
  return json(purchaseOrderDocument(row));
}

// API_MATERIAL_DOCUMENT_SRV: items for the purchase-order item, movement type 101, reference type B.
async function readGoodsReceipts(req: ToolRequest): Promise<string | void> {
  const purchaseOrder = required(req, "PurchaseOrder");
  const purchaseOrderItem = required(req, "PurchaseOrderItem");
  if (!purchaseOrder || !purchaseOrderItem) return;
  const items = await loadReceipts(purchaseOrder, purchaseOrderItem);
  return json({
    PurchaseOrder: purchaseOrder,
    PurchaseOrderItem: purchaseOrderItem,
    items: items.map(receiptItem),
  });
}

// API_SUPPLIERINVOICE_PROCESS_SRV: A_SupplierInvoice filtered by InvoicingParty, top 20, headers only.
async function readInvoiceHistory(req: ToolRequest): Promise<string | void> {
  const invoicingParty = required(req, "InvoicingParty");
  if (!invoicingParty) return;
  const rows = (await SELECT.from("sap.sim.SupplierInvoices").where({ InvoicingParty: invoicingParty }).limit(20)) as unknown as Row[];
  return json(rows.map((row) => invoiceDocument(row, false)));
}

// API_BUSINESS_PARTNER: A_BusinessPartner, supplier role, and one A_AddressEmailAddress.
async function readBusinessPartner(req: ToolRequest): Promise<string | void> {
  const supplier = required(req, "Supplier");
  if (!supplier) return;
  const row = (await SELECT.one
    .from("sap.sim.BusinessPartners")
    .columns("*", { ref: ["emails"], expand: ["*"] })
    .where({ Supplier: supplier })) as Row | null;
  if (!row) return notFound(req, `Supplier ${supplier} was not found in the simulated S/4 data.`);
  const email = first(row.emails);
  return json({
    BusinessPartner: text(row.BusinessPartner),
    BusinessPartnerName: text(row.BusinessPartnerName),
    Supplier: text(row.Supplier),
    EmailAddress: email ? text(email.EmailAddress) : null,
    contact: email
      ? {
          AddressID: text(email.AddressID),
          Person: text(email.Person),
          OrdinalNumber: text(email.OrdinalNumber),
        }
      : null,
  });
}

// Project calculation. Loads the invoice, purchase order, and goods receipts itself.
async function readVariance(req: ToolRequest): Promise<string | void> {
  const supplierInvoice = required(req, "SupplierInvoice");
  const fiscalYear = required(req, "FiscalYear");
  if (!supplierInvoice || !fiscalYear) return;
  const invoice = await loadInvoice(supplierInvoice, fiscalYear);
  if (!invoice) return notFound(req, `Supplier invoice ${supplierInvoice}/${fiscalYear} was not found in the simulated S/4 data.`);

  const items = list(invoice.items);
  const missing: string[] = [];
  let comparable = true;
  let invoicedQuantity = 0;
  let orderedQuantity = 0;
  let receivedQuantity = 0;
  let invoiceItemAmount = 0;
  let purchaseOrderNetAmount = 0;

  for (const item of items) {
    const invoiced = number(item.QuantityInPurchaseOrderUnit);
    const amount = number(item.SupplierInvoiceItemAmount);
    invoicedQuantity += invoiced;
    invoiceItemAmount += amount;

    const purchaseOrder = text(item.PurchaseOrder);
    const purchaseOrderItem = text(item.PurchaseOrderItem);
    const order = await loadPurchaseOrder(purchaseOrder);
    const orderItem = order ? list(order.items).find((row) => text(row.PurchaseOrderItem) === purchaseOrderItem) : undefined;
    if (!order || !orderItem) {
      comparable = false;
      missing.push(`Purchase order item ${purchaseOrder}/${purchaseOrderItem} was not found.`);
      continue;
    }

    const receipts = await loadReceipts(purchaseOrder, purchaseOrderItem);
    if (receipts.length === 0) missing.push(`No goods receipt for ${purchaseOrder}/${purchaseOrderItem}.`);
    const received = receipts.reduce((sum, row) => sum + number(row.QuantityInEntryUnit), 0);
    const unitsMatch = receipts.every((row) => text(row.EntryUnit) === text(item.PurchaseOrderQuantityUnit));
    if (!unitsMatch) {
      comparable = false;
      missing.push(`Unit ${text(item.PurchaseOrderQuantityUnit)} does not match the goods receipt unit.`);
    } else {
      receivedQuantity += received;
    }
    orderedQuantity += number(orderItem.OrderQuantity);

    const netPriceQuantity = number(orderItem.NetPriceQuantity);
    if (netPriceQuantity === 0) {
      comparable = false;
      missing.push(`Net price quantity for ${purchaseOrder}/${purchaseOrderItem} is zero.`);
    } else {
      purchaseOrderNetAmount += (number(orderItem.NetPriceAmount) / netPriceQuantity) * invoiced;
    }
  }

  const quantityDifference = comparable ? invoicedQuantity - receivedQuantity : 0;
  return json({
    comparable,
    DocumentCurrency: text(invoice.DocumentCurrency),
    invoicedQuantity: quantity(invoicedQuantity),
    orderedQuantity: quantity(orderedQuantity),
    receivedQuantity: quantity(receivedQuantity),
    quantityDifference: quantity(quantityDifference),
    invoiceItemAmount: money(invoiceItemAmount),
    purchaseOrderNetAmount: money(purchaseOrderNetAmount),
    priceDifference: money(invoiceItemAmount - purchaseOrderNetAmount),
    grossAmount: money(number(invoice.InvoiceGrossAmount)),
    grossAmountExcludedFromMatch: true,
    missing,
  });
}

async function loadInvoice(supplierInvoice: string, fiscalYear: string): Promise<Row | null> {
  return (await SELECT.one
    .from("sap.sim.SupplierInvoices")
    .columns("*", { ref: ["items"], expand: ["*"] })
    .where({ SupplierInvoice: supplierInvoice, FiscalYear: fiscalYear })) as Row | null;
}

async function loadPurchaseOrder(purchaseOrder: string): Promise<Row | null> {
  return (await SELECT.one
    .from("sap.sim.PurchaseOrders")
    .columns("*", { ref: ["items"], expand: ["*"] })
    .where({ PurchaseOrder: purchaseOrder })) as Row | null;
}

async function loadReceipts(purchaseOrder: string, purchaseOrderItem: string): Promise<Row[]> {
  const rows = (await SELECT.from("sap.sim.MaterialDocumentItems")
    .columns("*", { ref: ["header"], expand: ["*"] })
    .where({
      PurchaseOrder: purchaseOrder,
      PurchaseOrderItem: purchaseOrderItem,
      GoodsMovementType: "101",
      GoodsMovementRefDocType: "B",
    })) as unknown as Row[];
  return rows;
}

function invoiceDocument(row: Row, withItems: boolean): Row {
  const document: Row = {
    SupplierInvoice: text(row.SupplierInvoice),
    FiscalYear: text(row.FiscalYear),
    CompanyCode: text(row.CompanyCode),
    DocumentDate: date(row.DocumentDate),
    PostingDate: date(row.PostingDate),
    InvoicingParty: text(row.InvoicingParty),
    SupplierInvoiceIDByInvcgParty: text(row.SupplierInvoiceIDByInvcgParty),
    DocumentCurrency: text(row.DocumentCurrency),
    InvoiceGrossAmount: money(number(row.InvoiceGrossAmount)),
    PaymentBlockingReason: text(row.PaymentBlockingReason),
    SupplierInvoiceStatus: text(row.SupplierInvoiceStatus),
    SupplierInvoiceIsCreditMemo: text(row.SupplierInvoiceIsCreditMemo),
  };
  if (withItems) {
    document.to_SuplrInvcItemPurOrdRef = list(row.items).map((item) => ({
      SupplierInvoiceItem: text(item.SupplierInvoiceItem),
      PurchaseOrder: text(item.PurchaseOrder),
      PurchaseOrderItem: text(item.PurchaseOrderItem),
      Plant: text(item.Plant),
      DocumentCurrency: text(item.DocumentCurrency),
      SupplierInvoiceItemAmount: money(number(item.SupplierInvoiceItemAmount)),
      QuantityInPurchaseOrderUnit: quantity(number(item.QuantityInPurchaseOrderUnit)),
      PurchaseOrderQuantityUnit: text(item.PurchaseOrderQuantityUnit),
      ReferenceDocument: text(item.ReferenceDocument),
      ReferenceDocumentFiscalYear: text(item.ReferenceDocumentFiscalYear),
      ReferenceDocumentItem: text(item.ReferenceDocumentItem),
    }));
  }
  return document;
}

function purchaseOrderDocument(row: Row): Row {
  return {
    PurchaseOrder: text(row.PurchaseOrder),
    Supplier: text(row.Supplier),
    CompanyCode: text(row.CompanyCode),
    DocumentCurrency: text(row.DocumentCurrency),
    to_PurchaseOrderItem: list(row.items).map((item) => ({
      PurchaseOrder: text(row.PurchaseOrder),
      PurchaseOrderItem: text(item.PurchaseOrderItem),
      Material: text(item.Material),
      OrderQuantity: quantity(number(item.OrderQuantity)),
      PurchaseOrderQuantityUnit: text(item.PurchaseOrderQuantityUnit),
      NetPriceAmount: money(number(item.NetPriceAmount)),
      NetPriceQuantity: quantity(number(item.NetPriceQuantity)),
    })),
  };
}

function receiptItem(row: Row): Row {
  const header = (row.header ?? {}) as Row;
  return {
    MaterialDocument: text(header.MaterialDocument),
    MaterialDocumentYear: text(header.MaterialDocumentYear),
    MaterialDocumentItem: text(row.MaterialDocumentItem),
    GoodsMovementType: text(row.GoodsMovementType),
    GoodsMovementRefDocType: text(row.GoodsMovementRefDocType),
    QuantityInEntryUnit: quantity(number(row.QuantityInEntryUnit)),
    EntryUnit: text(row.EntryUnit),
    Material: text(row.Material),
    Plant: text(row.Plant),
    PostingDate: date(header.PostingDate),
  };
}

function required(req: ToolRequest, name: string): string | undefined {
  const value = req.data[name];
  if (value == null || value === "") {
    req._.res.status(400).json({ error: { code: "BAD_REQUEST", message: `${name} is required.` } });
    return undefined;
  }
  return value;
}

function notFound(req: ToolRequest, message: string): void {
  req._.res.status(404).json({ error: { code: "NOT_FOUND", message } });
}

function json(body: unknown): string {
  return JSON.stringify(body);
}

function list(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function first(value: unknown): Row | undefined {
  return list(value)[0];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function quantity(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function date(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
