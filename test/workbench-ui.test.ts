import assert from "node:assert/strict";
import { outcomeLabels } from "../srv/outcome-labels.ts";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = "4018";
const base = `http://127.0.0.1:${port}`;
const pending = ["awaiting_review", "open", "investigating", "investigation_failed"];

test("outcome labels follow a mocked summary", () => {
  const labels = outcomeLabels({ released: 1, subsequentCreditPosted: 1, dismissed: 1 });
  assert.deepEqual(
    labels.map((row) => row.label),
    ["Released", "Subsequent credit posted", "Dismissed"],
  );
  assert.deepEqual(
    labels.map((row) => row.count),
    [1, 1, 1],
  );
  const fragment = readFileSync("app/workbench/webapp/ext/Dashboard.fragment.xml", "utf8");
  for (const row of labels) assert.match(fragment, new RegExp(row.label));
  assert.match(fragment, /text="Dashboard"/);
  assert.match(fragment, /text="Pending"/);
  assert.match(fragment, /text="Processed"/);
  assert.match(fragment, /press=".showPending"/);
  assert.match(fragment, /press=".showProcessed"/);
  assert.match(fragment, /press=".refreshSummary"/);
  const controller = readFileSync("app/workbench/webapp/ext/ListReport.controller.js", "utf8");
  assert.match(controller, /_showFilters\(key !== "dashboard"\)/);
});

test("pending workbench lists simulated cases and hides retry until a failure", async () => {
  const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-ui-")), "db.sqlite");
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
  const child = start(dbFile);
  try {
    await ready(child);

    const controller = await fetch(`${base}/workbench-ui/ext/ListReport.controller.js`);
    assert.equal(controller.status, 200);
    const page = await fetch(`${base}/workbench-ui/index.html`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /simulated S\/4HANA Cloud data/);
    const sandbox = await fetch(`${base}/workbench-ui/test/flpSandbox.html`);
    assert.equal(sandbox.status, 200);
    assert.match(await sandbox.text(), /createRenderer/);
    const manifest = await (await fetch(`${base}/workbench-ui/manifest.json`)).json();
    const list = manifest["sap.ui5"].routing.targets.InvestigationsList.options.settings;
    assert.equal(list.content.table.noData.text, "No cases are waiting.");
    assert.equal(list.content.header, undefined);
    const views = list.views.paths.map((view: { key: string; annotationPath: string }) => view.annotationPath);
    assert.deepEqual(views, [
      "com.sap.vocabularies.UI.v1.SelectionPresentationVariant",
      "com.sap.vocabularies.UI.v1.SelectionPresentationVariant#History",
    ]);
    assert.equal(list.content.header.actions.retryInvestigation, undefined);
    const objectPage = manifest["sap.ui5"].routing.targets.InvestigationsObjectPage.options.settings;
    assert.equal(objectPage.content.header.actions.retryInvestigation.visible, "{= %{status} === 'investigation_failed' }");
    assert.equal(objectPage.content.header.actions.retryInvestigation.enabled, "{= %{status} === 'investigation_failed' }");

    const empty = await listPending();
    assert.equal(empty.length, 0);

    const samples = JSON.parse(readFileSync("app/workbench/webapp/sample-events.json", "utf8")) as Array<Record<string, unknown>>;
    assert.equal(samples.length, 3);
    for (const event of samples) {
      const posted = await fetch(`${base}/simulated-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal(posted.status, 202);
      const data = (event.data ?? {}) as { SupplierInvoice?: string };
      await waitProcessed(String(event.id), String(data.SupplierInvoice));
    }

    const rows = await listPending();
    assert.deepEqual(
      rows.map((row) => ({
        supplier: row.supplierName,
        reference: row.supplierInvoiceIdByInvoicingParty,
        amount: Number(row.invoiceGrossAmount),
        currency: row.documentCurrency,
        block: row.paymentBlockingReason,
        category: row.blockCategory,
        status: row.status,
      })),
      [
        { supplier: "Helios Fasteners GmbH", reference: "HF-2026-441", amount: 119, currency: "EUR", block: "A", category: "price", status: "awaiting_review" },
        { supplier: "Helios Fasteners GmbH", reference: "HF-2026-442", amount: 95.2, currency: "EUR", block: "A", category: "quantity", status: "awaiting_review" },
        { supplier: "Helios Fasteners GmbH", reference: "HF-2026-443", amount: 95.2, currency: "EUR", block: "A", category: "manual block", status: "awaiting_review" },
      ],
    );

    const price = rows.find((row) => row.supplierInvoice === "5100001001");
    assert.ok(price);
    const detail = await fetch(`${base}/workbench/Investigations(${price.ID})?$expand=evidence,poItems`);
    const body = (await detail.json()) as {
      narrative: string;
      priceDifference: string;
      recommendedAction: string;
      evidence: Array<{ field: string }>;
      poItems: Array<{ PurchaseOrder: string }>;
    };
    assert.match(body.narrative, /5100001001/);
    assert.equal(Number(body.priceDifference), 20);
    assert.equal(body.evidence.some((item) => item.field === "SupplierInvoiceItemAmount"), true);
    assert.equal(body.poItems.some((item) => item.PurchaseOrder === "4500001001"), true);

    const quantity = rows.find((row) => row.supplierInvoice === "5100001002");
    assert.ok(quantity);
    assert.equal(Number(quantity.quantityDifference), 2);
    assert.equal(quantity.recommendedAction === "release_payment_block" || quantity.recommendedAction === "post_subsequent_credit", false);

    for (const event of samples) {
      const again = await fetch(`${base}/simulated-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      assert.equal((await again.json()).status, "duplicate");
    }
    assert.equal((await listPending()).length, 3);
  } finally {
    child.kill();
  }
});

function start(dbFile: string): ChildProcess {
  return spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port, LLM_API_KEY: "", ADVISOR_FORCE_ACTION: "", cds_requires_db_credentials_url: dbFile },
  });
}

async function ready(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error("server exited");
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not start");
}

async function listPending(): Promise<Array<Record<string, string>>> {
  const filter = pending.map((status) => `status eq '${status}'`).join(" or ");
  const response = await fetch(
    `${base}/workbench/Investigations?$filter=${encodeURIComponent(filter)}&$orderby=supplierInvoice`,
  );
  const body = (await response.json()) as { value: Array<Record<string, string>> };
  return body.value;
}

async function waitProcessed(id: string, supplierInvoice: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const inbox = await fetch(`${base}/workbench/EventInbox?$filter=${encodeURIComponent(`id eq '${id}'`)}`);
    const rows = ((await inbox.json()) as { value: Array<{ status: string }> }).value;
    if (rows[0] && rows[0].status !== "received") {
      const cases = await fetch(`${base}/workbench/Investigations?$filter=${encodeURIComponent(`supplierInvoice eq '${supplierInvoice}'`)}`);
      const found = ((await cases.json()) as { value: unknown[] }).value;
      if (found.length === 1) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`event ${id} did not open a case`);
}
