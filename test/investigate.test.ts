import assert from "node:assert/strict";
import test from "node:test";
import { investigate, type InvestigateTools, type ToolArgs } from "../advisor/investigate.ts";

test("scripted price case calls the invoice, order, receipts, and variance tools", async () => {
  const called: string[] = [];
  const network: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    network.push("fetch");
    throw new Error("network");
  }) as typeof fetch;
  const previous = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "";
  try {
    const advice = await investigate({
      caseId: "case-1",
      objective: "Explain why this supplier invoice is blocked and recommend one action.",
      input: { SupplierInvoice: "5100001001", FiscalYear: "2026" },
      tools: fakeTools(called),
    });
    assert.equal(advice.recommendedAction, "post_subsequent_credit");
    assert.equal(advice.priceDifference, "20.00");
    assert.equal(advice.quantityDifference, "0");
    assert.deepEqual(called.slice(0, 4), [
      "get_supplier_invoice",
      "get_purchase_order",
      "get_goods_receipts",
      "calculate_invoice_variance",
    ]);
    assert.equal(network.length, 0);
    assert.match(advice.narrative, /unchanged/);
  } finally {
    globalThis.fetch = original;
    if (previous == null) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous;
  }
});

test("a tool wrapper rejects a call that omits a required field", async () => {
  process.env.LLM_API_KEY = "";
  const tools = fakeTools([]);
  tools.get_supplier_invoice = async () => ({});
  await assert.rejects(
    () =>
      investigate({
        caseId: "case-2",
        objective: "Explain the block",
        input: { SupplierInvoice: "", FiscalYear: "2026" },
        tools,
      }),
    { message: "SupplierInvoice is required." },
  );
});

function fakeTools(called: string[]): InvestigateTools {
  const record = (name: string, value: unknown) => async (_args: ToolArgs) => {
    called.push(name);
    return value;
  };
  return {
    get_supplier_invoice: record("get_supplier_invoice", {
      SupplierInvoice: "5100001001",
      FiscalYear: "2026",
      PaymentBlockingReason: "A",
      InvoicingParty: "17300001",
      to_SuplrInvcItemPurOrdRef: [
        {
          SupplierInvoiceItem: "1",
          PurchaseOrder: "4500001001",
          PurchaseOrderItem: "10",
          SupplierInvoiceItemAmount: "100.00",
        },
      ],
    }),
    get_purchase_order: record("get_purchase_order", {
      PurchaseOrder: "4500001001",
      Supplier: "17300001",
      to_PurchaseOrderItem: [{ PurchaseOrder: "4500001001", PurchaseOrderItem: "10", NetPriceAmount: "8.00" }],
    }),
    get_goods_receipts: record("get_goods_receipts", {
      items: [{ MaterialDocument: "5000001001", MaterialDocumentYear: "2026", MaterialDocumentItem: "1", QuantityInEntryUnit: "10" }],
    }),
    calculate_invoice_variance: record("calculate_invoice_variance", {
      comparable: true,
      priceDifference: "20.00",
      quantityDifference: "0",
    }),
    get_supplier_business_partner: record("get_supplier_business_partner", { Supplier: "17300001" }),
    get_supplier_invoice_history: record("get_supplier_invoice_history", []),
  };
}
