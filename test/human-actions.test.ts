import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = "4019";
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-actions-")), "db.sqlite");

test("approved actions write only what the reviewer confirmed", async () => {
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

    const releaseCase = await investigation("5100001003");
    const released = await act("releasePaymentBlock", { investigationId: releaseCase.ID });
    assert.equal(released.status, 200);
    assert.equal(released.body.action, "release_payment_block");
    const cleared = await invoice("5100001003");
    assert.equal(cleared.PaymentBlockingReason, "");
    assert.equal((await investigation("5100001003")).status, "closed");
    const again = await act("releasePaymentBlock", { investigationId: releaseCase.ID });
    assert.equal(again.status, 200);
    assert.equal(again.body.ID, released.body.ID);

    const creditCase = await investigation("5100001001");
    const blockedRelease = await act("releasePaymentBlock", { investigationId: creditCase.ID });
    assert.equal(blockedRelease.status, 409);
    assert.equal((await invoice("5100001001")).PaymentBlockingReason, "A");
    const quantityRelease = await act("releasePaymentBlock", { investigationId: (await investigation("5100001002")).ID });
    assert.equal(quantityRelease.status, 409);
    assert.equal((await invoice("5100001002")).PaymentBlockingReason, "A");
    const quantityCredit = await act("postSubsequentCredit", { investigationId: (await investigation("5100001002")).ID });
    assert.equal(quantityCredit.status, 409);

    const credited = await act("postSubsequentCredit", { investigationId: creditCase.ID });
    assert.equal(credited.status, 200);
    assert.equal(credited.body.simulatedDocument, "5100002001");
    const credit = await invoice("5100002001");
    assert.equal(credit.SupplierInvoiceIsCreditMemo, "X");
    assert.equal(credit.FiscalYear, "2026");
    const creditItem = credit.items[0];
    assert.ok(creditItem);
    assert.equal(Number(creditItem.SupplierInvoiceItemAmount), 20);
    assert.equal(Number(creditItem.QuantityInPurchaseOrderUnit), 10);
    assert.equal(creditItem.IsSubsequentDebitCredit, "X");
    assert.equal(creditItem.PurchaseOrder, "4500001001");
    assert.equal(creditItem.PurchaseOrderItem, "10");
    const original = await invoice("5100001001");
    assert.equal(original.PaymentBlockingReason, "A");
    assert.equal(Number(original.items[0]?.SupplierInvoiceItemAmount), 100);
    assert.equal(original.items[0]?.IsSubsequentDebitCredit ?? "", "");
    const repeatCredit = await act("postSubsequentCredit", { investigationId: creditCase.ID });
    assert.equal(repeatCredit.body.ID, credited.body.ID);
    assert.equal((await invoice("5100002002")).SupplierInvoice, undefined);

    const releaseAfterClose = await act("releasePaymentBlock", { investigationId: creditCase.ID });
    assert.equal(releaseAfterClose.body.ID, credited.body.ID);
    assert.equal((await invoice("5100001001")).PaymentBlockingReason, "A");

    const contact = await act("prepareSupplierContact", { investigationId: (await investigation("5100001002")).ID });
    assert.equal(contact.status, 200);
    assert.equal(contact.body.emailDraftTo, "ap@helios-fasteners.example");
    assert.match(contact.body.emailDraftBody, /HF-2026-442/);
    assert.match(contact.body.emailDraftBody, /confirm/i);
    const contacted = await investigation("5100001002");
    assert.equal(contacted.status, "awaiting_review");
    assert.equal((await invoice("5100001002")).PaymentBlockingReason, "A");

    const empty = await act("dismissInvestigation", { investigationId: contacted.ID, reason: "  " });
    assert.equal(empty.status, 400);
    const dismissed = await act("dismissInvestigation", { investigationId: contacted.ID, reason: "Supplier will reissue." });
    assert.equal(dismissed.status, 200);
    assert.equal(dismissed.body.action, "dismiss");
    assert.equal((await investigation("5100001002")).status, "closed");
    assert.equal((await invoice("5100001002")).PaymentBlockingReason, "A");

    const tools = await fetch(`${base}/agent-tools/$metadata`);
    const metadata = await tools.text();
    assert.doesNotMatch(metadata, /releasePaymentBlock|postSubsequentCredit|ActionImport/);
    const page = await fetch(`${base}/workbench-ui/ext/ObjectPage.js`);
    const source = await page.text();
    assert.match(source, /creditPosted/);
    const bundle = await (await fetch(`${base}/workbench-ui/i18n/i18n.properties`)).text();
    assert.match(bundle, /original invoice was not modified and remains blocked/);
    assert.match(bundle, /demo document number/);
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
  const id = `act-${supplierInvoice}`;
  const posted = await fetch(`${base}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      specversion: "1.0",
      id,
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
    if (row.status === "investigation_failed") {
      const recommendation =
        supplierInvoice === "5100001001"
          ? "post_subsequent_credit"
          : supplierInvoice === "5100001003"
            ? "release_payment_block"
            : "contact_supplier";
      const db = new DatabaseSync(dbFile);
      db.prepare("UPDATE invc_Investigations SET status = ?, recommendedAction = ? WHERE supplierInvoice = ?").run(
        "awaiting_review",
        recommendation,
        supplierInvoice,
      );
      db.close();
      return;
    }
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

async function act(name: string, data: Record<string, string>): Promise<{ status: number; body: Record<string, string> }> {
  const response = await fetch(`${base}/workbench/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as Record<string, string>) : {};
  return { status: response.status, body: parsed };
}

async function invoice(supplierInvoice: string): Promise<{
  SupplierInvoice?: string;
  FiscalYear?: string;
  PaymentBlockingReason?: string;
  SupplierInvoiceIsCreditMemo?: string;
  items: Array<Record<string, string>>;
}> {
  const response = await fetch(
    `${base}/simulated-s4/SupplierInvoices(SupplierInvoice='${supplierInvoice}',FiscalYear='2026')?$expand=items`,
  );
  if (response.status === 404) return { items: [] };
  return (await response.json()) as {
    SupplierInvoice?: string;
    FiscalYear?: string;
    PaymentBlockingReason?: string;
    SupplierInvoiceIsCreditMemo?: string;
    items: Array<Record<string, string>>;
  };
}
