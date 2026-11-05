import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const created = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";

test("a case without a model key fails before any recommendation", async () => {
  const ctx = start("4016");
  try {
    await ready(ctx);
    const before = await invoiceGross(ctx, "5100001001");
    const price = await openCase(ctx, "evt-1001", "5100001001");
    assert.equal(price.status, "investigation_failed");
    assert.match(String(price.narrative), /model key is required/);
    assert.equal(await invoiceGross(ctx, "5100001001"), before);
  } finally {
    ctx.child.kill();
  }
});

test("a mismatched recommendation fails closed and retry stops after three attempts", async () => {
  const ctx = start("4017", { ADVISOR_FORCE_ACTION: "release_payment_block" });
  try {
    await ready(ctx);
    const row = await openCase(ctx, "evt-mismatch", "5100001002");
    assert.equal(row.status, "investigation_failed");
    assert.notEqual(row.recommendedAction, "release_payment_block");
    const failed = await expand(ctx, String(row.ID));
    assert.match(failed.narrative, /model key is required/);

    const inbox = await inboxRow(ctx, "evt-mismatch");
    assert.equal(Number(inbox.attemptCount), 1);

    const second = await retry(ctx, String(row.ID));
    assert.equal(second, 204);
    const third = await retry(ctx, String(row.ID));
    assert.equal(third, 204);
    const stopped = await retry(ctx, String(row.ID));
    assert.equal(stopped, 409);
    const still = await expand(ctx, String(row.ID));
    assert.equal(still.status, "investigation_failed");
    const after = await inboxRow(ctx, "evt-mismatch");
    assert.equal(Number(after.attemptCount), 3);
  } finally {
    ctx.child.kill();
  }
});

type Ctx = { base: string; child: ChildProcess; logs: string };

function start(port: string, extra: Record<string, string> = {}): Ctx {
  const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-advisor-")), "db.sqlite");
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
  const ctx: Ctx = { base: `http://127.0.0.1:${port}`, child: null as unknown as ChildProcess, logs: "" };
  ctx.child = spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: port,
      CDS_invoiceAdvisor_apiKey: "",
      ADVISOR_FORCE_ACTION: "",
      cds_requires_db_credentials_url: dbFile,
      ...extra,
    },
  });
  ctx.child.stdout?.on("data", (chunk: Buffer) => {
    ctx.logs += chunk.toString();
  });
  ctx.child.stderr?.on("data", (chunk: Buffer) => {
    ctx.logs += chunk.toString();
  });
  return ctx;
}

async function ready(ctx: Ctx): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (ctx.child.exitCode != null) throw new Error(ctx.logs);
    try {
      const response = await fetch(`${ctx.base}/health`);
      if (response.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(ctx.logs);
}

async function openCase(ctx: Ctx, id: string, supplierInvoice: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${ctx.base}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      specversion: "1.0",
      id,
      source: "local/demo/simulated-s4",
      type: created,
      time: "2026-11-02T09:15:00Z",
      subject: `${supplierInvoice}/2026`,
      data: { SupplierInvoice: supplierInvoice, FiscalYear: "2026" },
    }),
  });
  assert.equal(response.status, 202);
  await inboxRow(ctx, id);
  const rows = await fetch(`${ctx.base}/workbench/Investigations?$filter=${encodeURIComponent(`supplierInvoice eq '${supplierInvoice}'`)}`);
  const body = (await rows.json()) as { value: Array<Record<string, unknown>> };
  const row = body.value[0];
  assert.ok(row);
  return row;
}

async function expand(ctx: Ctx, id: string): Promise<{
  status: string;
  narrative: string;
}> {
  const response = await fetch(`${ctx.base}/workbench/Investigations(${id})`);
  return (await response.json()) as {
    status: string;
    narrative: string;
  };
}

async function inboxRow(ctx: Ctx, id: string): Promise<{ status: string; attemptCount: number }> {
  const deadline = Date.now() + 15_000;
  let last = "";
  while (Date.now() < deadline) {
    const response = await fetch(`${ctx.base}/workbench/EventInbox?$filter=${encodeURIComponent(`id eq '${id}'`)}`);
    last = await response.text();
    const parsed = JSON.parse(last) as { value?: Array<{ status: string; attemptCount: number }> };
    const row = parsed.value?.[0];
    if (row && row.status !== "received") return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${last}\n${ctx.logs}`);
}

async function retry(ctx: Ctx, id: string): Promise<number> {
  const response = await fetch(`${ctx.base}/workbench/retryInvestigation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ID: id }),
  });
  return response.status;
}

async function invoiceGross(ctx: Ctx, supplierInvoice: string): Promise<number> {
  const response = await fetch(`${ctx.base}/simulated-s4/SupplierInvoices(SupplierInvoice='${supplierInvoice}',FiscalYear='2026')`);
  const body = (await response.json()) as { InvoiceGrossAmount: unknown };
  return Number(body.InvoiceGrossAmount);
}
