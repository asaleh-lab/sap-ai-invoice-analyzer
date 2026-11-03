import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = "4021";
const base = `http://127.0.0.1:${port}`;
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "invoice-publisher-")), "db.sqlite");
const created = "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1";

const suppliers = ["17300001", "17300002", "17300003", "17300004", "17300005"];

test("publisher files valid invoices and the seed covers several suppliers", async () => {
  const deployed = spawnSync(process.execPath, ["node_modules/@sap/cds-dk/bin/cds.js", "deploy", "--to", `sqlite:${dbFile}`], {
    encoding: "utf8",
  });
  assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
  const child = startServer();
  try {
    await waitUntilReady(child);

    const partners = await get<{ value: Array<{ BusinessPartner: string }> }>("/simulated-s4/BusinessPartners");
    for (const id of suppliers) assert.ok(partners.value.some((row) => row.BusinessPartner === id));

    const inbox = await get<{ value: unknown[] }>("/workbench/EventInbox");
    const cases = await get<{ value: unknown[] }>("/workbench/Investigations");
    assert.deepEqual(inbox.value, []);
    assert.deepEqual(cases.value, []);

    for (const id of suppliers) {
      const history = await get<{ value: Invoice[] }>(
        `/simulated-s4/SupplierInvoices?$filter=${encodeURIComponent(`InvoicingParty eq '${id}'`)}&$expand=items`,
      );
      assert.ok(history.value.length > 1, id);
      const blocked = history.value.find((row) => row.PaymentBlockingReason === "A");
      const open = history.value.find((row) => (row.PaymentBlockingReason ?? "") === "");
      assert.ok(blocked && open, id);
      for (const invoice of [blocked, open]) {
        assert.equal(invoice.items.length, 1);
        const item = invoice.items[0];
        const order = await get<{ items: Array<{ PurchaseOrderItem: string }> }>(
          `/simulated-s4/PurchaseOrders('${item.PurchaseOrder}')?$expand=items`,
        );
        assert.ok(order.items.some((row) => row.PurchaseOrderItem === item.PurchaseOrderItem));
        const receipt = await get<{ items: Array<{ MaterialDocumentItem: string; GoodsMovementType: string }> }>(
          `/simulated-s4/MaterialDocuments(MaterialDocument='${item.ReferenceDocument}',MaterialDocumentYear='${item.ReferenceDocumentFiscalYear}')?$expand=items`,
        );
        const receiptItem = receipt.items.find((row) => row.MaterialDocumentItem === item.ReferenceDocumentItem);
        assert.equal(receiptItem?.GoodsMovementType, "101");
      }
    }

    const page = await fetch(`${base}/publisher`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Simulated S\/4HANA Cloud documents/);
    assert.match(html, /data-template="price"/);
    assert.match(html, /data-template="quantity"/);
    assert.match(html, /data-template="matching"/);
    assert.match(html, /data-template="unblocked"/);
    assert.match(html, /href="\/workbench-ui"/);
    assert.doesNotMatch(html, /[Rr]etry/);

    const price = await publish("price");
    assert.equal(price.scenario, "Price variance");
    assert.equal(price.fiscalYear, "2026");
    assert.equal(price.caseOpened, true);
    assert.equal(price.inboxStatus, "processed");
    assert.equal(price.workbench, "/workbench-ui");
    await assertShape(price.supplierInvoice, { amount: 100, quantity: 10, poNet: 8, receiptQuantity: 10, block: "A" });
    assert.equal((await investigations(price.supplierInvoice)).length, 1);

    const quantity = await publish("quantity");
    assert.equal(quantity.caseOpened, true);
    assert.equal(quantity.inboxStatus, "processed");
    assert.notEqual(quantity.invoicingParty, price.invoicingParty);
    await assertShape(quantity.supplierInvoice, { amount: 80, quantity: 10, poNet: 8, receiptQuantity: 8, block: "A" });

    const matching = await publish("matching");
    assert.equal(matching.caseOpened, true);
    assert.equal(matching.inboxStatus, "processed");
    await assertShape(matching.supplierInvoice, { amount: 80, quantity: 10, poNet: 8, receiptQuantity: 10, block: "A" });

    const unblocked = await publish("unblocked");
    assert.equal(unblocked.caseOpened, false);
    assert.equal(unblocked.inboxStatus, "rejected");
    await assertShape(unblocked.supplierInvoice, { amount: 80, quantity: 10, poNet: 8, receiptQuantity: 10, block: "" });
    assert.equal((await investigations(unblocked.supplierInvoice)).length, 0);

    const again = await post(event(`again-${price.supplierInvoice}`, price.supplierInvoice, "2026"));
    assert.equal(again.status, 202);
    assert.equal((await waitInbox(`again-${price.supplierInvoice}`)).status, "duplicate_open_case");
    assert.equal((await investigations(price.supplierInvoice)).length, 1);

    const stored = await get<{ value: Array<{ status: string }> }>("/workbench/EventInbox");
    assert.ok(stored.value.every((row) => row.status !== "invalid"));
  } finally {
    child.kill();
  }
});

type Invoice = {
  PaymentBlockingReason?: string;
  items: Array<{
    PurchaseOrder: string;
    PurchaseOrderItem: string;
    ReferenceDocument: string;
    ReferenceDocumentFiscalYear: string;
    ReferenceDocumentItem: string;
    SupplierInvoiceItemAmount: unknown;
    QuantityInPurchaseOrderUnit: unknown;
  }>;
};

type Published = {
  scenario: string;
  supplierInvoice: string;
  fiscalYear: string;
  caseOpened: boolean;
  inboxStatus: string;
  invoicingParty: string;
  workbench: string;
};

async function assertShape(
  supplierInvoice: string,
  expected: { amount: number; quantity: number; poNet: number; receiptQuantity: number; block: string },
): Promise<void> {
  const invoice = await get<Invoice & { PaymentBlockingReason?: string; SupplierInvoiceStatus: string }>(
    `/simulated-s4/SupplierInvoices(SupplierInvoice='${supplierInvoice}',FiscalYear='2026')?$expand=items`,
  );
  assert.equal(invoice.SupplierInvoiceStatus, "5");
  assert.equal(invoice.PaymentBlockingReason ?? "", expected.block);
  const item = invoice.items[0];
  assert.equal(Number(item.SupplierInvoiceItemAmount), expected.amount);
  assert.equal(Number(item.QuantityInPurchaseOrderUnit), expected.quantity);
  const order = await get<{ items: Array<{ PurchaseOrderItem: string; NetPriceAmount: unknown; OrderQuantity: unknown }> }>(
    `/simulated-s4/PurchaseOrders('${item.PurchaseOrder}')?$expand=items`,
  );
  const poItem = order.items.find((row) => row.PurchaseOrderItem === item.PurchaseOrderItem);
  assert.equal(Number(poItem?.NetPriceAmount), expected.poNet);
  const receipt = await get<{ items: Array<{ MaterialDocumentItem: string; QuantityInEntryUnit: unknown; GoodsMovementType: string }> }>(
    `/simulated-s4/MaterialDocuments(MaterialDocument='${item.ReferenceDocument}',MaterialDocumentYear='2026')?$expand=items`,
  );
  const receiptItem = receipt.items.find((row) => row.MaterialDocumentItem === item.ReferenceDocumentItem);
  assert.equal(receiptItem?.GoodsMovementType, "101");
  assert.equal(Number(receiptItem?.QuantityInEntryUnit), expected.receiptQuantity);
}

async function publish(template: string): Promise<Published> {
  const response = await fetch(`${base}/publisher/invoices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template }),
  });
  const body = (await response.json()) as Published;
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

function event(id: string, supplierInvoice: string, fiscalYear: string): Record<string, unknown> {
  return {
    specversion: "1.0",
    id,
    source: "local/demo/simulated-s4",
    type: created,
    time: "2026-11-03T18:00:00Z",
    datacontenttype: "application/json",
    subject: `${supplierInvoice}/${fiscalYear}`,
    data: { SupplierInvoice: supplierInvoice, FiscalYear: fiscalYear, SupplierInvoiceFiscalYear: fiscalYear },
  };
}

function startServer(): ChildProcess {
  return spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port, LLM_API_KEY: "", ADVISOR_FORCE_ACTION: "", cds_requires_db_credentials_url: dbFile },
  });
}

let logs = "";

async function waitUntilReady(child: ChildProcess): Promise<void> {
  child.stdout?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited\n${logs}`);
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready\n${logs}`);
}

async function get<T>(url: string): Promise<T> {
  const response = await fetch(`${base}${url}`);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

async function post(body: unknown): Promise<{ status: number }> {
  const response = await fetch(`${base}/simulated-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status };
}

async function waitInbox(id: string): Promise<{ status: string }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const parsed = await get<{ value?: Array<{ status: string }> }>(`/workbench/EventInbox?$filter=${encodeURIComponent(`id eq '${id}'`)}`);
    const row = parsed.value?.[0];
    if (row && row.status !== "received") return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`inbox ${id} stayed received\n${logs}`);
}

async function investigations(supplierInvoice: string): Promise<unknown[]> {
  const filter = `supplierInvoice eq '${supplierInvoice}' and fiscalYear eq '2026'`;
  const parsed = await get<{ value?: unknown[] }>(`/workbench/Investigations?$filter=${encodeURIComponent(filter)}`);
  return parsed.value ?? [];
}
