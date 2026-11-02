import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = "4014";
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-events-")), "db.sqlite");

const created = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";

test("supplier invoice created events open one case", async () => {
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);

  const first = startServer();
  try {
    await waitUntilReady(first);

    const processed = await post(event("evt-price-1", "5100001001", "2026"));
    assert.equal(processed.status, 202);
    assert.deepEqual(processed.body, { inboxId: "evt-price-1", status: "received" });
    const inbox = await waitInbox("evt-price-1");
    assert.equal(inbox.status, "processed");

    const cases = await investigations("5100001001", "2026");
    assert.equal(cases.length, 1);
    assert.equal(cases[0]?.status, "open");
    assert.equal(cases[0]?.invoicingParty, "17300001");
    assert.equal(cases[0]?.documentCurrency, "EUR");
    assert.equal(Number(cases[0]?.invoiceGrossAmount), 119);
    assert.equal(cases[0]?.paymentBlockingReason, "A");
    assert.equal(cases[0]?.supplierInvoiceIdByInvoicingParty, "HF-2026-441");
    assert.equal(Number(cases[0]?.projectTolerance), 0.5);

    const again = await post(event("evt-price-1", "5100001001", "2026"));
    assert.deepEqual(again.body, { inboxId: "evt-price-1", status: "duplicate" });
    assert.equal((await investigations("5100001001", "2026")).length, 1);

    const second = await post(event("evt-price-2", "5100001001", "2026"));
    assert.equal(second.body.status, "received");
    const duplicateCase = await waitInbox("evt-price-2");
    assert.equal(duplicateCase.status, "duplicate_open_case");
    assert.equal((await investigations("5100001001", "2026")).length, 1);

    const missing = await post(event("evt-missing", "5100001999", "2026"));
    assert.equal(missing.body.status, "received");
    assert.equal((await waitInbox("evt-missing")).status, "rejected");
    assert.equal((await investigations("5100001999", "2026")).length, 0);

    const unblocked = await post(event("evt-unblocked", "5100000900", "2026"));
    assert.equal((await waitInbox("evt-unblocked")).status, "rejected");
    assert.equal((await investigations("5100000900", "2026")).length, 0);

    const invalid = await post({ ...event("evt-no-year", "5100001001", "2026"), data: { SupplierInvoice: "5100001001" } });
    assert.deepEqual(invalid.body, { inboxId: "evt-no-year", status: "invalid" });

    const otherType = await post({
      ...event("evt-canceled", "5100001001", "2026"),
      type: "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Canceled.v1",
    });
    assert.deepEqual(otherType.body, { inboxId: "evt-canceled", status: "invalid" });
    assert.equal((await investigations("5100001001", "2026")).length, 1);

    const unreadable = await fetch(`${base}/simulated-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    assert.equal(unreadable.status, 400);
  } finally {
    first.kill();
  }

  const restarted = startServer();
  try {
    await waitUntilReady(restarted);
    const kept = await waitInbox("evt-price-1");
    assert.equal(kept.status, "processed");
  } finally {
    restarted.kill();
  }
});

function event(id: string, supplierInvoice: string, fiscalYear: string): Record<string, unknown> {
  return {
    specversion: "1.0",
    id,
    source: "local/demo/simulated-s4",
    type: created,
    time: "2026-11-02T09:15:00Z",
    datacontenttype: "application/json",
    subject: `${supplierInvoice}/${fiscalYear}`,
    data: { SupplierInvoice: supplierInvoice, FiscalYear: fiscalYear, SupplierInvoiceFiscalYear: fiscalYear },
  };
}

function startServer(): ChildProcess {
  const child = spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port, cds_requires_db_credentials_url: dbFile },
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  return child;
}

let logs = "";

async function waitUntilReady(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited\n${logs}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready\n${logs}\n${String(lastError)}`);
}

async function post(body: unknown): Promise<{ status: number; body: { inboxId?: string; status?: string } }> {
  const response = await fetch(`${base}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as { inboxId?: string; status?: string } };
}

async function waitInbox(id: string): Promise<{ status: string }> {
  const deadline = Date.now() + 10_000;
  let last = "";
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/workbench/EventInbox?$filter=id eq '${id}'`);
    last = await response.text();
    const parsed = JSON.parse(last) as { value?: Array<{ status: string }> };
    const row = parsed.value?.[0];
    if (row && row.status !== "received") return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`inbox ${id} stayed received\n${last}\n${logs}`);
}

async function investigations(supplierInvoice: string, fiscalYear: string): Promise<Array<Record<string, unknown>>> {
  const filter = `supplierInvoice eq '${supplierInvoice}' and fiscalYear eq '${fiscalYear}'`;
  const response = await fetch(`${base}/workbench/Investigations?$filter=${encodeURIComponent(filter)}`);
  const body = (await response.json()) as { value?: Array<Record<string, unknown>> };
  return body.value ?? [];
}
