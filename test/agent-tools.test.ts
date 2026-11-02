import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";

const port = "4013";
const base = `http://127.0.0.1:${port}`;

test("agent tools return the seeded SAP reads", async () => {
  const child = startServer();
  try {
    await waitUntilReady(child);

    const price = await tool<Invoice>("getSupplierInvoice", {
      SupplierInvoice: "5100001001",
      FiscalYear: "2026",
    });
    assert.equal(price.PaymentBlockingReason, "A");
    assert.equal(price.to_SuplrInvcItemPurOrdRef[0]?.PurchaseOrder, "4500001001");
    assert.equal(price.to_SuplrInvcItemPurOrdRef[0]?.PurchaseOrderItem, "10");

    const order = await tool<PurchaseOrder>("getPurchaseOrder", { PurchaseOrder: "4500001001" });
    const item = order.to_PurchaseOrderItem.find((row) => row.PurchaseOrderItem === "10");
    assert.ok(item);
    assert.equal(item.NetPriceAmount, "8.00");
    assert.equal(item.OrderQuantity, "10");

    const received = await tool<GoodsReceipts>("getGoodsReceipts", {
      PurchaseOrder: "4500001001",
      PurchaseOrderItem: "10",
    });
    assert.equal(received.items[0]?.QuantityInEntryUnit, "10");

    const short = await tool<GoodsReceipts>("getGoodsReceipts", {
      PurchaseOrder: "4500001002",
      PurchaseOrderItem: "10",
    });
    assert.equal(short.items[0]?.QuantityInEntryUnit, "8");

    const history = await tool<InvoiceHeader[]>("getSupplierInvoiceHistory", { InvoicingParty: "17300001" });
    const ids = history.map((row) => row.SupplierInvoice);
    assert.equal(history.length, 4);
    for (const id of ["5100000900", "5100001001", "5100001002", "5100001003"]) {
      assert.ok(ids.includes(id), id);
    }
    assert.equal("to_SuplrInvcItemPurOrdRef" in history[0], false);

    const partner = await tool<Partner>("getSupplierBusinessPartner", { Supplier: "17300001" });
    assert.equal(partner.EmailAddress, "ap@helios-fasteners.example");

    const priceVariance = await tool<Variance>("calculateInvoiceVariance", {
      SupplierInvoice: "5100001001",
      FiscalYear: "2026",
    });
    assert.equal(priceVariance.priceDifference, "20.00");
    assert.equal(priceVariance.quantityDifference, "0");
    assert.equal(priceVariance.comparable, true);
    assert.equal(priceVariance.grossAmountExcludedFromMatch, true);

    const quantityVariance = await tool<Variance>("calculateInvoiceVariance", {
      SupplierInvoice: "5100001002",
      FiscalYear: "2026",
    });
    assert.equal(quantityVariance.quantityDifference, "2");
    assert.equal(quantityVariance.priceDifference, "0.00");

    const matched = await tool<Variance>("calculateInvoiceVariance", {
      SupplierInvoice: "5100001003",
      FiscalYear: "2026",
    });
    assert.equal(matched.quantityDifference, "0");
    assert.equal(matched.priceDifference, "0.00");

    const missing = await call("getSupplierInvoice", {
      SupplierInvoice: "5100001999",
      FiscalYear: "2026",
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error?.code, "NOT_FOUND");

    const emptyReceipts = await tool<GoodsReceipts>("getGoodsReceipts", {
      PurchaseOrder: "4500001999",
      PurchaseOrderItem: "10",
    });
    assert.deepEqual(emptyReceipts.items, []);

    const badRequest = await call("getSupplierInvoice", { SupplierInvoice: "5100001001" });
    assert.equal(badRequest.status, 400);
    assert.equal(badRequest.body.error?.code, "BAD_REQUEST");

    const created = await fetch(`${base}/simulated-s4/SupplierInvoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ SupplierInvoice: "999", FiscalYear: "2026" }),
    });
    assert.equal(created.ok, false);
  } finally {
    child.kill();
  }
});

type Invoice = InvoiceHeader & {
  PaymentBlockingReason: string;
  to_SuplrInvcItemPurOrdRef: Array<{ PurchaseOrder: string; PurchaseOrderItem: string }>;
};
type InvoiceHeader = { SupplierInvoice: string };
type PurchaseOrder = { to_PurchaseOrderItem: Array<{ PurchaseOrderItem: string; NetPriceAmount: string; OrderQuantity: string }> };
type GoodsReceipts = { items: Array<{ QuantityInEntryUnit: string }> };
type Partner = { EmailAddress: string };
type Variance = {
  priceDifference: string;
  quantityDifference: string;
  comparable: boolean;
  grossAmountExcludedFromMatch: boolean;
};

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

async function tool<T>(name: string, args: Record<string, string>): Promise<T> {
  const response = await call(name, args);
  assert.equal(response.status, 200, `${name} ${response.status} ${JSON.stringify(response.body)}`);
  return response.body as T;
}

async function call(name: string, args: Record<string, string>): Promise<{ status: number; body: ErrorEnvelope & Record<string, unknown> }> {
  const keys = Object.entries(args)
    .map(([key, value]) => `${key}='${value}'`)
    .join(",");
  const response = await fetch(`${base}/agent-tools/${name}(${keys})`);
  const text = await response.text();
  const parsed = JSON.parse(text) as { value?: unknown };
  const body = typeof parsed.value === "string" ? (JSON.parse(parsed.value) as ErrorEnvelope) : (parsed as ErrorEnvelope);
  return { status: response.status, body };
}

type ErrorEnvelope = { error?: { code?: string } };
