import cds from "@sap/cds";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readSupplierInvoiceDocument } from "./agent-tools.ts";
import { investigateCase } from "./investigation.ts";
import { projectTolerance } from "./project-tolerance.ts";

const createdType = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";

type Row = Record<string, unknown>;

type Where = {
  where(filter: Record<string, unknown>): Promise<Row | Row[] | null>;
};

type Sql = {
  INSERT: { into(entity: string): { entries(row: Row): Promise<unknown> } };
  SELECT: { one: { from(entity: string): Where }; from(entity: string): Where };
  UPDATE(entity: string): { set(data: Row): Where };
};

type CdsRuntime = {
  log(area: string): { info(...parts: unknown[]): void; error(...parts: unknown[]): void };
  tx<T>(fn: () => Promise<T>): Promise<T>;
  spawn(fn: () => Promise<void>): void;
  ql: Sql;
  utils: { uuid(): string };
};

const runtime = cds as unknown as CdsRuntime;
const { INSERT, SELECT, UPDATE } = runtime.ql;
const log = runtime.log("events");

let drainQueue: Promise<void> = Promise.resolve();

export function resumeReceivedRows(): void {
  (cds as unknown as { on(event: "served", handler: () => void): void }).on("served", () => {
    drainQueue = drainQueue.then(async () => {
      const pending = (await runtime.tx(() => SELECT.from("invc.EventInbox").where({ status: "received" }))) as Row[];
      for (const row of pending) await drain(text(row.id));
    });
  });
}

export function registerSimulatedEvents(app: {
  post(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
}): void {
  app.post("/simulated-events", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      void acceptEvent(Buffer.concat(chunks).toString("utf8"), res).catch((error: unknown) => {
        log.error(error instanceof Error ? error.message : error);
        if (!res.headersSent) {
          reply(res, 500, { error: { code: "FAILED", message: "Event was not stored." } });
        }
      });
    });
  });
}

async function acceptEvent(raw: string, res: ServerResponse): Promise<void> {
  let parsed: unknown;
  try {
    parsed = raw.trim() === "" ? undefined : JSON.parse(raw);
  } catch {
    reply(res, 400, { error: { code: "BAD_REQUEST", message: "Event body is not JSON." } });
    return;
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    reply(res, 400, { error: { code: "BAD_REQUEST", message: "Event body must be a JSON object." } });
    return;
  }

  const body = parsed as Row;
  const id = typeof body.id === "string" ? body.id : "";
  if (id === "" || id.length > 64) {
    reply(res, 400, { error: { code: "BAD_REQUEST", message: "Event id is required." } });
    return;
  }

  const existing = (await runtime.tx(() => SELECT.one.from("invc.EventInbox").where({ id }))) as Row | null;
  if (existing) {
    log.info(id, "duplicate");
    reply(res, 202, { inboxId: id, status: "duplicate" });
    return;
  }

  // A type other than SupplierInvoice.Created.v1 is invalid and does not open a case.
  const problem = structuralProblem(body);
  const data = dataObject(body);
  const row: Row = {
    id,
    source: text(body.source).slice(0, 128),
    type: text(body.type).slice(0, 128),
    time: timestamp(body.time),
    subject: text(body.subject).slice(0, 32),
    supplierInvoice: invoiceKey(data?.SupplierInvoice, 10),
    fiscalYear: invoiceKey(data?.FiscalYear, 4),
    status: problem ? "invalid" : "received",
    attemptCount: 1,
    receivedAt: new Date().toISOString(),
  };

  try {
    await runtime.tx(() => INSERT.into("invc.EventInbox").entries(row));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE")) {
      log.info(id, "duplicate");
      reply(res, 202, { inboxId: id, status: "duplicate" });
      return;
    }
    throw error;
  }
  log.info(id, row.status);
  if (!problem) {
    // Listener is registered before the response ends. One process queues drains so two ids cannot race.
    res.on("finish", () => {
      drainQueue = drainQueue.then(() => drain(id));
    });
  }
  reply(res, 202, { inboxId: id, status: row.status });
}

async function drain(id: string): Promise<void> {
  await new Promise<void>((resolve) => {
    runtime.spawn(async () => {
      try {
        await consume(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await UPDATE("invc.EventInbox")
          .set({ status: "failed", errorMessage: message.slice(0, 500) })
          .where({ id });
        log.error(id, "failed");
      } finally {
        resolve();
      }
    });
  });
}

async function consume(id: string): Promise<void> {
  const inbox = (await SELECT.one.from("invc.EventInbox").where({ id })) as Row | null;
  if (!inbox || inbox.status !== "received") return;

  const supplierInvoice = text(inbox.supplierInvoice);
  const fiscalYear = text(inbox.fiscalYear);
  const invoice = await readSupplierInvoiceDocument(supplierInvoice, fiscalYear);
  const reason = invoice ? text(invoice.PaymentBlockingReason) : "";
  if (!invoice || reason === "") {
    await UPDATE("invc.EventInbox").set({ status: "rejected" }).where({ id });
    log.info(id, "rejected");
    return;
  }

  const cases = (await SELECT.from("invc.Investigations").where({ supplierInvoice, fiscalYear })) as Row[];
  const open = cases.find((row) => row.status !== "closed");
  if (open) {
    await UPDATE("invc.EventInbox").set({ status: "duplicate_open_case", investigation_ID: open.ID }).where({ id });
    log.info(id, "duplicate_open_case");
    return;
  }

  const investigationId = runtime.utils.uuid();
  await INSERT.into("invc.Investigations").entries({
    ID: investigationId,
    supplierInvoice,
    fiscalYear,
    invoicingParty: text(invoice.InvoicingParty),
    supplierName: await supplierName(text(invoice.InvoicingParty)),
    supplierInvoiceIdByInvoicingParty: text(invoice.SupplierInvoiceIDByInvcgParty),
    documentCurrency: text(invoice.DocumentCurrency),
    invoiceGrossAmount: Number(invoice.InvoiceGrossAmount),
    paymentBlockingReason: reason,
    status: "open",
    projectTolerance,
  });
  await investigateCase(investigationId, supplierInvoice, fiscalYear);
  await UPDATE("invc.EventInbox").set({ status: "processed", investigation_ID: investigationId }).where({ id });
  log.info(id, "processed");
}

async function supplierName(invoicingParty: string): Promise<string> {
  const partner = (await SELECT.one.from("sap.sim.BusinessPartners").where({ Supplier: invoicingParty })) as Row | null;
  return text(partner?.BusinessPartnerName);
}

function structuralProblem(body: Row): boolean {
  if (body.specversion !== "1.0") return true;
  if (body.type !== createdType) return true;
  if (typeof body.source !== "string" || body.source === "") return true;
  const data = dataObject(body);
  if (!data) return true;
  if (typeof data.SupplierInvoice !== "string" || data.SupplierInvoice === "" || data.SupplierInvoice.length > 10) return true;
  if (typeof data.FiscalYear !== "string" || data.FiscalYear === "" || data.FiscalYear.length > 4) return true;
  if (data.SupplierInvoiceFiscalYear != null && data.SupplierInvoiceFiscalYear !== "" && data.SupplierInvoiceFiscalYear !== data.FiscalYear) {
    return true;
  }
  return false;
}

function dataObject(body: Row): Row | null {
  const data = body.data;
  if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Row;
}

function reply(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function invoiceKey(value: unknown, max: number): string {
  const key = text(value);
  return key.length > max ? "" : key;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
