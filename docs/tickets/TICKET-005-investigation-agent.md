# TICKET-005: Advisor module

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-005 |
| Title | TypeScript advisor, tool calls, and an evidence-backed recommendation |
| Priority | High. MVP. Evening 2. |
| Estimated effort | 5 hours |
| Dependencies | TICKET-004 |

## User story

As a reviewer, I want each open case to gain a recommendation that quotes the simulated SAP reads, so I can see why the next action was proposed before I approve it.

## Context

Policy and finding types: [tool-catalog.md](../architecture/tool-catalog.md). The advisor is read-only ([ADR 0004](../adr/0004-read-only-agent-human-approved-writes.md)). Variance numbers come from `calculateInvoiceVariance`. The module boundary is [ADR 0005](../adr/0005-advisor-module-in-the-cap-app.md).

## Scope

- After a case is created, the investigation handler sets status `investigating` and calls `investigate` in the advisor module with:

```json
{
  "caseId": "<investigation uuid>",
  "objective": "Explain why this supplier invoice is blocked and recommend one action.",
  "input": { "SupplierInvoice": "5100001001", "FiscalYear": "2026" },
  "tools": {}
}
```

- `tools` holds the six read functions from ticket 003. The invoice document is not an argument. The advisor module does not import `@sap/cds` or the invoice model.
- The advisor is TypeScript and uses `@langchain/langgraph` 1.6.0. The graph may call the injected tools in a loop. Versions are in [solution-overview.md](../architecture/solution-overview.md).
- Scripted policy when `LLM_API_KEY` is empty, implementing the catalog rules:
  - `5100001001` → `post_subsequent_credit`
  - `5100001002` → `contact_supplier`
  - `5100001003` → `release_payment_block`
- CAP persists findings, evidence, narrative, recommended action, price difference, and quantity difference, then sets `awaiting_review`.
- CAP rejects a recommendation that breaks the policy, stores a finding of kind `missing` or a failure, and sets `investigation_failed`.
- Model path: if `LLM_API_KEY` is set, the model writes the narrative and chooses tool order. The same CAP policy gate runs. Amounts in the stored case always come from the variance tool.
- Retry action `retryInvestigation` runs the advisor again on `investigation_failed` and increments the inbox attempt count. After three attempts the next call is rejected and the failure stays.

## Out of scope

UI, human write actions, email sending, a second model, RAG, a second process for the advisor.

## Implementation requirements

- Tool wrappers send the structured arguments from the catalog. They validate required fields before calling the injected function.
- Evidence rows use api, entity, object key, field, and value. At least the payment block, the item amount, the PO net price, and the received quantity are stored when those reads happened.
- Narrative for the scripted policy is a short English paragraph that names the supplier invoice, the price or quantity difference, and the recommended action. It says the invoice is unchanged.
- Assumptions include the sentence that the tolerance `0.50` is project configuration and is not SAP tolerance customizing.
- The model call times out after 60 seconds. Timeout sets `investigation_failed`.
- Keep the LLM key out of logs and out of the investigation row.

## SAP documentation

Tool catalog and the release versus subsequent-credit correction in [solution-overview.md](../architecture/solution-overview.md).

## Expected artifacts

`advisor/` TypeScript graph, the investigation handler that calls it and stores findings and evidence, tests that do not call a live model.

## Acceptance criteria

- [ ] With an empty `LLM_API_KEY`, processing `5100001001` stores `post_subsequent_credit`, price difference `20.00`, quantity difference `0`, status `awaiting_review`.
- [ ] `5100001002` stores `contact_supplier` and quantity difference `2`. It does not store `post_subsequent_credit` or `release_payment_block`.
- [ ] `5100001003` stores `release_payment_block` and both differences `0`.
- [ ] Each of those cases has at least one `fact` finding and one evidence row whose `api` is `API_SUPPLIERINVOICE_PROCESS_SRV` and whose `field` is `PaymentBlockingReason`.
- [ ] The price case has evidence for `SupplierInvoiceItemAmount` and for the purchase order net price.
- [ ] A recommendation payload that says `release_payment_block` for `5100001002` is refused and the case becomes `investigation_failed`.
- [ ] No row in `sap.sim.SupplierInvoices` changes during this ticket.
- [ ] The handler calls `investigate` without a pre-assembled invoice document. The test asserts the advisor requests the invoice tool.
- [ ] A unit test calls `investigate` with fake tool functions. The advisor calls those functions and does not import `@sap/cds`.

## Test cases

- Scripted policy for the three invoices.
- Policy gate rejects a mismatched action.
- Advisor unit test with fake tools records the tool names called for the price case: invoice, purchase order, goods receipts, variance. Business partner and history may also be called.
- Missing `LLM_API_KEY` does not attempt an outbound model call.

## Demo value

The stored recommendation is tied to fields from the simulated SAP reads, and the tool loop stays in its own module.

## Risks

A live model may skip a tool. The policy gate must fail closed. The scripted policy is the demo path and must pass with no network.
