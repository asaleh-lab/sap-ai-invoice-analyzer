import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = "4021";
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-summary-")), "db.sqlite");

test("summary counts closed outcomes and leaves a contact draft pending", async () => {
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
  const child = startServer();
  try {
    await waitUntilReady(child);
    await open("5100001001");
    await open("5100001002");
    await open("5100001003");

    const quantity = await investigation("5100001002");
    const draft = await act("prepareSupplierContact", { investigationId: quantity.ID, actor: "reviewer" });
    assert.equal(draft.status, 200);
    const afterDraft = await summary();
    assert.equal(afterDraft.pending, 3);
    assert.equal(afterDraft.closed, 0);
    assert.equal(afterDraft.contactDrafts, 1);

    const price = await investigation("5100001001");
    const credited = await act("postSubsequentCredit", { investigationId: price.ID, actor: "reviewer" });
    assert.equal(credited.status, 200);
    const priceOnly = await summary();
    assert.equal(priceOnly.pending, 2);
    assert.equal(priceOnly.closed, 1);
    assert.equal(priceOnly.subsequentCreditPosted, 1);
    const helios = priceOnly.suppliers.find((row) => row.supplierName.includes("Helios Fasteners"));
    assert.ok(helios);
    assert.equal(helios.pendingCount, 2);
    assert.equal(helios.highlighted, true);

    const manual = await investigation("5100001003");
    const released = await act("releasePaymentBlock", { investigationId: manual.ID, actor: "reviewer" });
    assert.equal(released.status, 200);
    const dismissed = await act("dismissInvestigation", {
      investigationId: quantity.ID,
      actor: "reviewer",
      reason: "Supplier will reissue.",
    });
    assert.equal(dismissed.status, 200);

    const done = await summary();
    assert.equal(done.pending, 0);
    assert.equal(done.closed, 3);
    assert.equal(done.released, 1);
    assert.equal(done.subsequentCreditPosted, 1);
    assert.equal(done.dismissed, 1);

    const history = await closedHistory();
    assert.deepEqual(
      history.map((row) => row.supplierInvoice),
      ["5100001002", "5100001003", "5100001001"],
    );
    assert.equal(history.some((row) => row.status !== "closed"), false);
    const times = history.map((row) => row.closedAt);
    assert.deepEqual(times, [...times].sort().reverse());
  } finally {
    child.kill();
  }
});

function startServer(): ChildProcess {
  return spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: "ignore",
    env: { ...process.env, PORT: port, CDS_invoiceAdvisor_apiKey: "", ADVISOR_FORCE_ACTION: "", cds_requires_db_credentials_url: dbFile },
  });
}

async function waitUntilReady(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not become ready");
}

async function open(supplierInvoice: string): Promise<void> {
  const posted = await fetch(`${base}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      specversion: "1.0",
      id: `sum-${supplierInvoice}`,
      source: "simulated-s4",
      type: "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1",
      time: "2026-10-16T08:00:00Z",
      data: { SupplierInvoice: supplierInvoice, FiscalYear: "2026" },
    }),
  });
  assert.equal(posted.status, 202);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const row = await investigation(supplierInvoice);
    if (row.status === "awaiting_review") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${supplierInvoice} did not reach review`);
}

async function investigation(supplierInvoice: string): Promise<{ ID: string; status: string }> {
  const filter = encodeURIComponent(`supplierInvoice eq '${supplierInvoice}' and fiscalYear eq '2026'`);
  const response = await fetch(`${base}/workbench/Investigations?$filter=${filter}`);
  const body = (await response.json()) as { value?: Array<{ ID: string; status: string }> };
  return body.value?.[0] ?? { ID: "", status: "" };
}

async function act(name: string, data: Record<string, string>): Promise<{ status: number }> {
  const response = await fetch(`${base}/workbench/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return { status: response.status };
}

type Summary = {
  pending: number;
  closed: number;
  released: number;
  subsequentCreditPosted: number;
  dismissed: number;
  contactDrafts: number;
  suppliers: Array<{ supplierName: string; pendingCount: number; highlighted: boolean }>;
};

async function summary(): Promise<Summary> {
  const response = await fetch(`${base}/workbench/workbenchSummary()`);
  assert.equal(response.status, 200);
  return (await response.json()) as Summary;
}

async function closedHistory(): Promise<Array<{ supplierInvoice: string; status: string; closedAt: string }>> {
  const filter = encodeURIComponent("status eq 'closed'");
  const response = await fetch(`${base}/workbench/Investigations?$filter=${filter}&$orderby=closedAt desc`);
  const body = (await response.json()) as { value: Array<{ supplierInvoice: string; status: string; closedAt: string }> };
  return body.value;
}
