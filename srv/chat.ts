import cds from "@sap/cds";
import { advisorSettings } from "../advisor/config.ts";
import { answerFollowUp } from "../advisor/follow-up.ts";
import type { InvestigateTools } from "../advisor/investigate.ts";

type Row = Record<string, unknown>;

type Where = {
  where(filter: Record<string, unknown>): Promise<Row | Row[] | null>;
};

type Sql = {
  INSERT: { into(entity: string): { entries(row: Row): Promise<unknown> } };
  SELECT: { one: { from(entity: string): Where }; from(entity: string): Where };
  UPDATE(entity: string): { set(data: Row): Where };
};

type ActionRequest = {
  data: { ID?: string; question?: string };
  reject(code: number, message: string): never;
};

const runtime = cds as unknown as {
  services: Record<string, { on(event: string, handler: (req: ActionRequest) => Promise<Row>): void }>;
  on(event: "served", handler: () => void): void;
  connect: { to(service: string): Promise<{ send(event: string, data: Record<string, string>): Promise<unknown> }> };
  utils: { uuid(): string };
  ql: Sql;
};

const { INSERT, SELECT, UPDATE } = runtime.ql;
const pendingEmail = new Map<string, { to: string; body: string }>();

export function registerFollowUp(): void {
  runtime.on("served", () => {
    runtime.services.InvestigationService?.on("askInvestigation", async (req) => {
      const id = req.data.ID ?? "";
      const question = (req.data.question ?? "").trim();
      if (id === "" || question === "") req.reject(400, "ID and question are required.");
      return ask(id, question, req);
    });
    runtime.services.InvestigationService?.on("confirmSendEmail", async (req) => {
      const id = req.data.ID ?? "";
      if (id === "") req.reject(400, "ID is required.");
      return confirmEmail(id, req);
    });
  });
}

async function ask(id: string, question: string, req: ActionRequest): Promise<Row> {
  const row = (await SELECT.one.from("invc.Investigations").where({ ID: id })) as Row | null;
  if (!row || row.status !== "awaiting_review") req.reject(409, "Questions are available on a case awaiting review.");
  const now = new Date().toISOString();
  await INSERT.into("invc.Messages").entries({
    ID: runtime.utils.uuid(),
    investigation_ID: id,
    role: "reviewer",
    text: question.slice(0, 4000),
    askedAt: now,
  });

  const invoice = await send("getSupplierInvoice", {
    SupplierInvoice: text(row.supplierInvoice),
    FiscalYear: text(row.fiscalYear),
  });
  const invoiceRow = asRecord(invoice);
  const item = list(invoiceRow?.to_SuplrInvcItemPurOrdRef)[0];
  const history = (await send("getSupplierInvoiceHistory", { InvoicingParty: text(row.invoicingParty) })) as Row[];
  const order = item ? asRecord(await send("getPurchaseOrder", { PurchaseOrder: text(item.PurchaseOrder) })) : null;
  const orderItem = list(order?.to_PurchaseOrderItem)[0];
  const partner = asRecord(await send("getSupplierBusinessPartner", { Supplier: text(row.invoicingParty) }));
  const advice = await answerFollowUp(
    question,
    {
      supplierName: text(row.supplierName),
      supplierInvoice: text(row.supplierInvoice),
      fiscalYear: text(row.fiscalYear),
      purchaseOrder: text(item?.PurchaseOrder),
      purchaseOrderItem: text(item?.PurchaseOrderItem),
      history: Array.isArray(history) ? history : [],
      material: text(orderItem?.Material),
      materialName: text(orderItem?.MaterialName),
      essential: orderItem?.EssentialMaterial === true || orderItem?.EssentialMaterial === 1,
      priceDifference: Number(row.priceDifference ?? 0),
      quantityDifference: Number(row.quantityDifference ?? 0),
      comparable: true,
      tolerance: Number(row.projectTolerance ?? 0.5),
      currentAction: text(row.recommendedAction),
      supplierEmail: text(partner?.EmailAddress),
      contactName: text(asRecord(partner?.contact)?.ContactName),
      reviewerName: advisorSettings().reviewerName,
    },
    readTools(),
  );

  let emailTo = "";
  let emailBody = "";
  let confirmationRequired = false;
  if (advice.email) {
    const held = asRecord(await send("sendEmail", { To: advice.email.to, Body: advice.email.body, Confirmed: "false" }));
    if (held?.confirmationRequired === true) {
      pendingEmail.set(id, advice.email);
      emailTo = advice.email.to;
      emailBody = advice.email.body;
      confirmationRequired = true;
    }
  }

  await INSERT.into("invc.Messages").entries({
    ID: runtime.utils.uuid(),
    investigation_ID: id,
    role: "advisor",
    text: advice.reply.slice(0, 4000),
    askedAt: new Date().toISOString(),
  });
  if (advice.recommendedAction && advice.recommendedAction !== text(row.recommendedAction)) {
    await UPDATE("invc.Investigations").set({ recommendedAction: advice.recommendedAction }).where({ ID: id });
  }
  return { reply: advice.reply, recommendedAction: advice.recommendedAction, emailTo, emailBody, confirmationRequired };
}

async function confirmEmail(id: string, req: ActionRequest): Promise<Row> {
  const pending = pendingEmail.get(id);
  const row = (await SELECT.one.from("invc.Investigations").where({ ID: id })) as Row | null;
  if (!row || row.status !== "awaiting_review") req.reject(409, "Questions are available on a case awaiting review.");
  if (!pending) req.reject(409, "There is no email waiting for confirmation.");
  const partner = asRecord(await send("getSupplierBusinessPartner", { Supplier: text(row.invoicingParty) }));
  if (pending.to !== text(partner?.EmailAddress)) req.reject(409, "The email address is not the supplier contact.");
  const sent = asRecord(await send("sendEmail", { To: pending.to, Body: pending.body, Confirmed: "true" }));
  if (sent?.sent !== true) req.reject(409, "The email was not sent.");
  pendingEmail.delete(id);
  await UPDATE("invc.Investigations")
    .set({ status: "closed", outcome: "contact_supplier", closedAt: new Date().toISOString() })
    .where({ ID: id });
  await INSERT.into("invc.Decisions").entries({
    ID: runtime.utils.uuid(),
    investigation_ID: id,
    action: "contact_supplier",
    reason: "",
    actor: advisorSettings().reviewerName,
    decidedAt: new Date().toISOString(),
    simulatedDocument: "",
    simulatedFiscalYear: "",
    emailDraftTo: pending.to,
    emailDraftBody: pending.body,
  });
  const reply = `Email to ${pending.to} was sent after confirmation. This demo does not deliver it to a mailbox.`;
  await INSERT.into("invc.Messages").entries({
    ID: runtime.utils.uuid(),
    investigation_ID: id,
    role: "advisor",
    text: reply,
    askedAt: new Date().toISOString(),
  });
  return { reply, recommendedAction: text(row.recommendedAction), emailTo: "", emailBody: "", confirmationRequired: false };
}

function readTools(): InvestigateTools {
  return {
    get_supplier_invoice: (args) => send("getSupplierInvoice", args),
    get_purchase_order: (args) => send("getPurchaseOrder", args),
    get_goods_receipts: (args) => send("getGoodsReceipts", args),
    get_supplier_invoice_history: (args) => send("getSupplierInvoiceHistory", args),
    get_supplier_business_partner: (args) => send("getSupplierBusinessPartner", args),
    calculate_invoice_variance: (args) => send("calculateInvoiceVariance", args),
  };
}

async function send(event: string, data: Record<string, string>): Promise<unknown> {
  const service = await runtime.connect.to("AgentToolService");
  const body = await service.send(event, data);
  if (typeof body !== "string") return body;
  return JSON.parse(body) as unknown;
}

function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function list(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
