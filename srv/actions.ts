import cds from "@sap/cds";
import { allowedActions } from "../advisor/policy.ts";

type Row = Record<string, unknown>;

type Where = {
  where(filter: Record<string, unknown>): Promise<Row | Row[] | null>;
};

type Sql = {
  INSERT: { into(entity: string): { entries(row: Row | Row[]): Promise<unknown> } };
  SELECT: {
    one: { from(entity: string): { columns(...columns: unknown[]): Where } };
    from(entity: string): { where(filter: Record<string, unknown>): Promise<Row[]> };
  };
  UPDATE(entity: string): { set(data: Row): Where };
};

type ActionRequest = {
  data: { investigationId?: string; actor?: string; reason?: string };
  reject(code: number, message: string): never;
};

type Variance = {
  comparable: boolean;
  priceDifference: string;
  quantityDifference: string;
  invoicedQuantity: string;
};

const runtime = cds as unknown as {
  connect: { to(service: string): Promise<{ send(event: string, data: Record<string, string>): Promise<unknown> }> };
  services: Record<string, { on(event: string, handler: (req: ActionRequest) => Promise<Row>): void }>;
  on(event: "served", handler: () => void): void;
  utils: { uuid(): string };
  ql: Sql;
};

const { INSERT, SELECT, UPDATE } = runtime.ql;
const firstCredit = 5100002001;

export function registerHumanActions(): void {
  runtime.on("served", () => {
    const service = runtime.services.InvestigationService;
    service?.on("releasePaymentBlock", (req) => release(req));
    service?.on("postSubsequentCredit", (req) => credit(req));
    service?.on("prepareSupplierContact", (req) => contact(req));
    service?.on("dismissInvestigation", (req) => dismiss(req));
  });
}

async function release(req: ActionRequest): Promise<Row> {
  const row = await openCase(req);
  const existing = await closedDecision(row);
  if (existing) return existing;
  await mark(text(row.ID));
  const variance = await varianceFor(row);
  const tolerance = Number(row.projectTolerance ?? 0.5);
  const allowed = allowedActions(numbers(variance), Number.isFinite(tolerance) ? tolerance : 0.5);
  if (text(row.recommendedAction) !== "release_payment_block" || !allowed.includes("release_payment_block")) {
    await restore(text(row.ID));
    req.reject(409, "Release is not allowed for this invoice.");
  }
  const invoice = await loadInvoice(text(row.supplierInvoice), text(row.fiscalYear));
  if (!invoice || text(invoice.PaymentBlockingReason) === "") {
    await restore(text(row.ID));
    req.reject(409, "The invoice has no payment block to release.");
  }
  // Function import Release on API_SUPPLIERINVOICE_PROCESS_SRV takes SupplierInvoice,
  // FiscalYear, and DiscountDaysHaveToBeShifted false. The demo does not call a SAP host.
  await UPDATE("sap.sim.SupplierInvoices")
    .set({ PaymentBlockingReason: "" })
    .where({ SupplierInvoice: text(row.supplierInvoice), FiscalYear: text(row.fiscalYear) });
  await UPDATE("invc.Investigations")
    .set({ paymentBlockingReason: "", status: "closed", outcome: "release_payment_block", closedAt: new Date().toISOString() })
    .where({ ID: text(row.ID) });
  return saveDecision(row, "release_payment_block", "", text(row.supplierInvoice), text(row.fiscalYear), "", "");
}

async function credit(req: ActionRequest): Promise<Row> {
  const row = await openCase(req);
  const existing = await closedDecision(row);
  if (existing) return existing;
  await mark(text(row.ID));
  const variance = await varianceFor(row);
  const tolerance = Number(row.projectTolerance ?? 0.5);
  const allowed = allowedActions(numbers(variance), Number.isFinite(tolerance) ? tolerance : 0.5);
  if (text(row.recommendedAction) !== "post_subsequent_credit" || !allowed.includes("post_subsequent_credit")) {
    await restore(text(row.ID));
    req.reject(409, "A subsequent credit is not allowed for this invoice.");
  }
  const invoice = await loadInvoice(text(row.supplierInvoice), text(row.fiscalYear));
  const item = list(invoice?.items)[0];
  if (!invoice || !item) {
    await restore(text(row.ID));
    req.reject(409, "The invoice has no purchase-order item to credit.");
  }
  const number = await nextCreditNumber(text(row.fiscalYear));
  const amount = Number(variance.priceDifference);
  await INSERT.into("sap.sim.SupplierInvoices").entries({
    SupplierInvoice: number,
    FiscalYear: text(row.fiscalYear),
    CompanyCode: text(invoice.CompanyCode),
    DocumentDate: invoice.DocumentDate,
    PostingDate: invoice.PostingDate,
    InvoicingParty: text(invoice.InvoicingParty),
    SupplierInvoiceIDByInvcgParty: text(invoice.SupplierInvoiceIDByInvcgParty),
    DocumentCurrency: text(invoice.DocumentCurrency),
    InvoiceGrossAmount: amount,
    PaymentBlockingReason: "",
    SupplierInvoiceStatus: "5",
    SupplierInvoiceIsCreditMemo: "X",
    TaxIsCalculatedAutomatically: false,
    items: [
      {
        SupplierInvoiceItem: text(item.SupplierInvoiceItem) || "1",
        PurchaseOrder: text(item.PurchaseOrder),
        PurchaseOrderItem: text(item.PurchaseOrderItem),
        Plant: text(item.Plant),
        DocumentCurrency: text(item.DocumentCurrency),
        SupplierInvoiceItemAmount: amount,
        QuantityInPurchaseOrderUnit: Number(variance.invoicedQuantity),
        PurchaseOrderQuantityUnit: text(item.PurchaseOrderQuantityUnit),
        IsSubsequentDebitCredit: "X",
      },
    ],
  });
  await UPDATE("invc.Investigations")
    .set({ status: "closed", outcome: "post_subsequent_credit", closedAt: new Date().toISOString() })
    .where({ ID: text(row.ID) });
  return saveDecision(row, "post_subsequent_credit", "", number, text(row.fiscalYear), "", "");
}

async function contact(req: ActionRequest): Promise<Row> {
  const row = await openCase(req);
  if (text(row.status) === "closed") return (await closedDecision(row)) ?? req.reject(409, "The case is already closed.");
  const partner = await tool("getSupplierBusinessPartner", { Supplier: text(row.invoicingParty) });
  const email = text(partner.EmailAddress);
  if (email === "") req.reject(409, "The supplier has no email address.");
  const variance = await varianceFor(row);
  const difference = Number(variance.quantityDifference) !== 0 ? `quantity difference ${variance.quantityDifference}` : `price difference ${variance.priceDifference}`;
  const reference = text(row.supplierInvoiceIdByInvoicingParty);
  const body = `Invoice ${reference} (${text(row.supplierInvoice)}/${text(row.fiscalYear)}) has a ${difference}. Please confirm. This draft was not sent.`;
  return saveDecision(row, "contact_supplier", "", "", "", email, body);
}

async function dismiss(req: ActionRequest): Promise<Row> {
  const reason = text(req.data.reason).trim();
  if (reason === "") req.reject(400, "A dismiss reason is required.");
  const row = await openCase(req);
  const existing = await closedDecision(row);
  if (existing) return existing;
  await UPDATE("invc.Investigations")
    .set({ status: "closed", outcome: "dismiss", closedAt: new Date().toISOString() })
    .where({ ID: text(row.ID) });
  return saveDecision(row, "dismiss", reason.slice(0, 1000), "", "", "", "");
}

async function openCase(req: ActionRequest): Promise<Row> {
  const id = text(req.data.investigationId);
  if (id === "") req.reject(400, "investigationId is required.");
  const actor = text(req.data.actor || "local.reviewer");
  if (actor.length > 80) req.reject(400, "Actor is longer than 80 characters.");
  const row = (await SELECT.one.from("invc.Investigations").columns("*").where({ ID: id })) as Row | null;
  if (!row) req.reject(404, "Investigation was not found.");
  if (text(row.status) !== "awaiting_review" && text(row.status) !== "closed") {
    req.reject(409, "The case is not waiting for a decision.");
  }
  return { ...row, actor };
}

async function closedDecision(row: Row): Promise<Row | null> {
  if (text(row.status) !== "closed") return null;
  const found = (await SELECT.one.from("invc.Decisions").columns("*").where({ investigation_ID: text(row.ID) })) as Row | null;
  return found;
}

async function mark(id: string): Promise<void> {
  await UPDATE("invc.Investigations").set({ status: "action_in_progress" }).where({ ID: id });
}

async function restore(id: string): Promise<void> {
  await UPDATE("invc.Investigations").set({ status: "awaiting_review" }).where({ ID: id });
}

async function varianceFor(row: Row): Promise<Variance> {
  const body = await tool("calculateInvoiceVariance", {
    SupplierInvoice: text(row.supplierInvoice),
    FiscalYear: text(row.fiscalYear),
  });
  return body as Variance;
}

async function tool(event: string, data: Record<string, string>): Promise<Row> {
  const service = await runtime.connect.to("AgentToolService");
  const body = await service.send(event, data);
  if (typeof body === "string") return JSON.parse(body) as Row;
  return (body ?? {}) as Row;
}

async function loadInvoice(supplierInvoice: string, fiscalYear: string): Promise<Row | null> {
  return (await SELECT.one
    .from("sap.sim.SupplierInvoices")
    .columns("*", { ref: ["items"], expand: ["*"] })
    .where({ SupplierInvoice: supplierInvoice, FiscalYear: fiscalYear })) as Row | null;
}

async function nextCreditNumber(fiscalYear: string): Promise<string> {
  const rows = await SELECT.from("sap.sim.SupplierInvoices").where({ FiscalYear: fiscalYear });
  const highest = list(rows).reduce((max, row) => {
    const value = Number(text(row.SupplierInvoice));
    return value >= firstCredit && value > max ? value : max;
  }, firstCredit - 1);
  return String(highest + 1);
}

async function saveDecision(
  row: Row,
  action: string,
  reason: string,
  simulatedDocument: string,
  simulatedFiscalYear: string,
  emailDraftTo: string,
  emailDraftBody: string,
): Promise<Row> {
  const decision = {
    ID: runtime.utils.uuid(),
    investigation_ID: text(row.ID),
    action,
    reason,
    actor: text(row.actor),
    decidedAt: new Date().toISOString(),
    simulatedDocument,
    simulatedFiscalYear,
    emailDraftTo,
    emailDraftBody,
  };
  await INSERT.into("invc.Decisions").entries(decision);
  return decision;
}

function numbers(variance: Variance): { comparable: boolean; priceDifference: number; quantityDifference: number } {
  return {
    comparable: variance.comparable !== false,
    priceDifference: Number(variance.priceDifference),
    quantityDifference: Number(variance.quantityDifference),
  };
}

function list(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
