import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { projectTolerance } from "../srv/project-tolerance.ts";

const port = "4012";
const base = `http://127.0.0.1:${port}`;

test("simulated documents match the seeded SAP cases", async () => {
  const child = startServer();
  try {
    await waitUntilReady(child);

    const price = await invoice("5100001001");
    assert.equal(num(price.InvoiceGrossAmount), 119);
    assert.equal(price.PaymentBlockingReason, "A");
    assert.equal(price.SupplierInvoiceIDByInvcgParty, "HF-2026-441");
    assert.equal(price.items.length, 1);
    assert.equal(num(price.items[0].SupplierInvoiceItemAmount), 100);
    assert.equal(price.items[0].PurchaseOrder, "4500001001");
    assert.equal(price.items[0].IsSubsequentDebitCredit ?? "", "");

    const po = await get<{ items: Array<Record<string, unknown>> }>(
      "/simulated-s4/PurchaseOrders('4500001001')?$expand=items",
    );
    const poItem = po.items.find((item) => item.PurchaseOrderItem === "10");
    assert.ok(poItem);
    assert.equal(num(poItem.NetPriceAmount), 8);
    assert.equal(num(poItem.NetPriceQuantity), 1);
    assert.equal(num(poItem.OrderQuantity), 10);

    const receipt = await get<{ items: Array<Record<string, unknown>> }>(
      "/simulated-s4/MaterialDocuments(MaterialDocument='5000001001',MaterialDocumentYear='2026')?$expand=items",
    );
    const receiptItem = receipt.items.find((item) => item.PurchaseOrderItem === "10");
    assert.ok(receiptItem);
    assert.equal(receiptItem.GoodsMovementType, "101");
    assert.equal(num(receiptItem.QuantityInEntryUnit), 10);

    const short = await invoice("5100001002");
    assert.equal(num(short.items[0].QuantityInPurchaseOrderUnit), 10);
    const shortPo = await get<{ items: Array<Record<string, unknown>> }>(
      `/simulated-s4/PurchaseOrders('${short.items[0].PurchaseOrder}')?$expand=items`,
    );
    const shortPoItem = shortPo.items.find((item) => item.PurchaseOrderItem === short.items[0].PurchaseOrderItem);
    assert.ok(shortPoItem);
    assert.equal(num(short.items[0].SupplierInvoiceItemAmount), num(shortPoItem.NetPriceAmount) * 10);
    const shortReceipt = await get<{ items: Array<Record<string, unknown>> }>(
      `/simulated-s4/MaterialDocuments(MaterialDocument='${short.items[0].ReferenceDocument}',MaterialDocumentYear='${short.items[0].ReferenceDocumentFiscalYear}')?$expand=items`,
    );
    const shortItem = shortReceipt.items.find(
      (item) => item.MaterialDocumentItem === short.items[0].ReferenceDocumentItem,
    );
    assert.ok(shortItem);
    assert.equal(num(shortItem.QuantityInEntryUnit), 8);

    const match = await invoice("5100001003");
    assert.equal(num(match.items[0].SupplierInvoiceItemAmount), 80);
    assert.equal(match.PaymentBlockingReason, "A");

    const history = await invoice("5100000900");
    assert.equal(history.PaymentBlockingReason ?? "", "");
    assert.equal(num(history.items[0].SupplierInvoiceItemAmount), 40);
    assert.equal(num(history.items[0].QuantityInPurchaseOrderUnit), 5);

    for (const row of [price, short, match, history]) {
      assert.equal(row.SupplierInvoiceStatus, "5");
      assert.equal(row.SupplierInvoiceIsCreditMemo ?? "", "");
      assert.equal(row.items[0].IsSubsequentDebitCredit ?? "", "");
    }

    const partner = await get<{ BusinessPartnerName: string; emails: Array<{ EmailAddress: string }> }>(
      "/simulated-s4/BusinessPartners('17300001')?$expand=emails",
    );
    assert.equal(partner.BusinessPartnerName, "Helios Fasteners GmbH");
    assert.equal(partner.emails[0].EmailAddress, "ap@helios-fasteners.example");

    const created = await fetch(`${base}/simulated-s4/SupplierInvoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ SupplierInvoice: "999", FiscalYear: "2026" }),
    });
    assert.equal(created.ok, false);

    const investigations = await get<{ value: unknown[] }>("/workbench/Investigations");
    assert.deepEqual(investigations.value, []);

    assert.equal(num(price.items[0].SupplierInvoiceItemAmount) - num(poItem.NetPriceAmount) * 10, 20);
    assert.equal(projectTolerance, 0.5);
  } finally {
    child.kill();
  }
});

function startServer(): ChildProcess {
  const child = spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port },
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

async function invoice(id: string) {
  return get<{
    InvoiceGrossAmount: unknown;
    PaymentBlockingReason: string | null;
    SupplierInvoiceIDByInvcgParty: string;
    SupplierInvoiceStatus: string;
    SupplierInvoiceIsCreditMemo: string | null;
    items: Array<Record<string, unknown>>;
  }>(`/simulated-s4/SupplierInvoices(SupplierInvoice='${id}',FiscalYear='2026')?$expand=items`);
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`);
  const text = await response.text();
  assert.equal(response.ok, true, `${path} ${response.status} ${text}`);
  return JSON.parse(text) as T;
}

function num(value: unknown): number {
  return Number(value);
}
