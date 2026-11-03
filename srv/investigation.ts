import cds from "@sap/cds";
import { investigate, type InvestigateTools } from "../advisor/investigate.ts";
import { allowedActions } from "../advisor/policy.ts";

type Row = Record<string, unknown>;

type Where = {
  where(filter: Record<string, unknown>): Promise<Row | Row[] | null>;
};

type Sql = {
  INSERT: { into(entity: string): { entries(row: Row | Row[]): Promise<unknown> } };
  SELECT: { one: { from(entity: string): Where }; from(entity: string): Where };
  UPDATE(entity: string): { set(data: Row): Where };
  DELETE: { from(entity: string): Where };
};

type ActionRequest = {
  data: { ID?: string };
  reject(code: number, message: string): never;
};

const runtime = cds as unknown as {
  tx<T>(fn: () => Promise<T>): Promise<T>;
  connect: { to(service: string): Promise<{ send(event: string, data: Record<string, string>): Promise<unknown> }> };
  services: Record<string, { on(event: string, handler: (req: ActionRequest) => Promise<void>): void }>;
  on(event: "served", handler: () => void): void;
  utils: { uuid(): string };
  ql: Sql;
  log(area: string): { info(...parts: unknown[]): void; error(...parts: unknown[]): void };
};

const { INSERT, SELECT, UPDATE, DELETE } = runtime.ql;
const log = runtime.log("investigation");

export function registerRetry(): void {
  runtime.on("served", () => {
    runtime.services.InvestigationService?.on("retryInvestigation", async (req) => {
      const id = req.data.ID ?? "";
      if (id === "") req.reject(400, "ID is required.");
      await retry(id, req);
    });
  });
}

export async function investigateCase(investigationId: string, supplierInvoice: string, fiscalYear: string): Promise<void> {
  await UPDATE("invc.Investigations").set({ status: "investigating" }).where({ ID: investigationId });
  await finish(investigationId, supplierInvoice, fiscalYear);
}

async function retry(investigationId: string, req: ActionRequest): Promise<void> {
  const row = (await SELECT.one.from("invc.Investigations").where({ ID: investigationId })) as Row | null;
  if (!row || row.status !== "investigation_failed") req.reject(409, "Only a failed investigation can be retried.");
  const inbox = (await SELECT.one.from("invc.EventInbox").where({ investigation_ID: investigationId })) as Row | null;
  const attempts = Number(inbox?.attemptCount ?? 0);
  if (attempts >= 3) req.reject(409, "Investigation has already been attempted three times.");
  if (inbox) {
    await UPDATE("invc.EventInbox")
      .set({ attemptCount: attempts + 1 })
      .where({ id: inbox.id });
  }
  await finish(investigationId, text(row.supplierInvoice), text(row.fiscalYear));
  log.info(investigationId, "retried");
}

async function finish(investigationId: string, supplierInvoice: string, fiscalYear: string): Promise<void> {
  const tolerance = await readTolerance(investigationId);
  try {
    const advice = await investigate({
      caseId: investigationId,
      objective: "Explain why this supplier invoice is blocked and recommend one action.",
      input: { SupplierInvoice: supplierInvoice, FiscalYear: fiscalYear },
      tools: readTools(),
    });
    const action = process.env.ADVISOR_FORCE_ACTION || advice.recommendedAction;
    const allowed = allowedActions(
      {
        comparable: advice.comparable,
        priceDifference: advice.priceDifferenceNumber,
        quantityDifference: advice.quantityDifferenceNumber,
      },
      tolerance,
    );
    const grounded = advice.toolsCalled.includes("get_supplier_invoice") && advice.toolsCalled.includes("calculate_invoice_variance");
    if (!grounded || !allowed.includes(action)) {
      await storeFailure(investigationId, `Recommendation ${action} was refused.`);
      return;
    }
    await UPDATE("invc.Investigations")
      .set({
        status: "awaiting_review",
        recommendedAction: action,
        narrative: advice.narrative.slice(0, 2000),
        priceDifference: advice.priceDifferenceNumber,
        quantityDifference: advice.quantityDifferenceNumber,
      })
      .where({ ID: investigationId });
    log.info(investigationId, "awaiting_review");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investigation failed.";
    log.error(investigationId, "investigation_failed");
    await storeFailure(investigationId, message.slice(0, 1000));
  }
}

async function storeFailure(investigationId: string, message: string): Promise<void> {
  await UPDATE("invc.Investigations")
    .set({ status: "investigation_failed", narrative: message.slice(0, 2000) })
    .where({ ID: investigationId });
}

async function readTolerance(investigationId: string): Promise<number> {
  const row = (await SELECT.one.from("invc.Investigations").where({ ID: investigationId })) as Row | null;
  const tolerance = Number(row?.projectTolerance ?? 0.5);
  return Number.isFinite(tolerance) ? tolerance : 0.5;
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

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
