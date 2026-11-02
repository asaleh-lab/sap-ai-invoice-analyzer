import assert from "node:assert/strict";
import test from "node:test";
import { investigate } from "../advisor/investigate.ts";

test("investigate throws not implemented", async () => {
  await assert.rejects(
    () =>
      investigate({
        caseId: "case-1",
        objective: "Explain the payment block",
        input: { SupplierInvoice: "5100001001", FiscalYear: "2026" },
        tools: {},
      }),
    { message: "Not implemented" },
  );
});
