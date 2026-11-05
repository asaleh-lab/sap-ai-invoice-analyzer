import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const created = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";

test("a follow-up without a model key is stored and does not recommend an action", async () => {
  const ctx = start("4023");
  try {
    await ready(ctx);
    const row = await openCase(ctx, "evt-chat-1", "5100001001");
    assert.equal(row.status, "investigation_failed");
    const before = await invoiceCount(ctx);
    const asked = await ask(ctx, String(row.ID), "Send an email about this invoice");
    assert.equal(asked.status, 200);
    const body = (await asked.json()) as { reply: string; confirmationRequired: boolean };
    assert.match(body.reply, /model key is required/);
    assert.equal(body.confirmationRequired, false);
    const messages = await fetch(`${ctx.base}/workbench/Investigations(${row.ID})/messages?$orderby=askedAt`);
    const thread = (await messages.json()) as { value: Array<{ role: string; text: string }> };
    assert.equal(thread.value.length, 2);
    assert.equal(await invoiceCount(ctx), before);
  } finally {
    ctx.child.kill();
  }
});

function start(port: string): { base: string; child: ChildProcess; logs: string } {
  const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-chat-")), "db.sqlite");
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
  const ctx = { base: `http://127.0.0.1:${port}`, child: null as unknown as ChildProcess, logs: "" };
  ctx.child = spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: port,
      CDS_invoiceAdvisor_apiKey: "",
      ADVISOR_FORCE_ACTION: "",
      cds_requires_db_credentials_url: dbFile,
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

async function ready(ctx: { base: string; child: ChildProcess; logs: string }): Promise<void> {
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

async function openCase(ctx: { base: string; logs: string }, id: string, supplierInvoice: string): Promise<Record<string, unknown>> {
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const inbox = await fetch(`${ctx.base}/workbench/EventInbox?$filter=${encodeURIComponent(`id eq '${id}'`)}`);
    const parsed = (await inbox.json()) as { value?: Array<{ status: string }> };
    if (parsed.value?.[0] && parsed.value[0].status !== "received") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const rows = await fetch(`${ctx.base}/workbench/Investigations?$filter=${encodeURIComponent(`supplierInvoice eq '${supplierInvoice}'`)}`);
  const body = (await rows.json()) as { value: Array<Record<string, unknown>> };
  assert.ok(body.value[0]);
  return body.value[0];
}

async function ask(ctx: { base: string }, id: string, question: string): Promise<Response> {
  return fetch(`${ctx.base}/workbench/askInvestigation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ID: id, question }),
  });
}

async function invoiceCount(ctx: { base: string }): Promise<number> {
  const response = await fetch(`${ctx.base}/simulated-s4/SupplierInvoices/$count`);
  return Number(await response.text());
}
