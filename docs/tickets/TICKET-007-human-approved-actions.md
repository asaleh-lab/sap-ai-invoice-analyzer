# TICKET-007: Human-approved actions

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-007 |
| Title | Release, subsequent credit, contact draft, and dismiss |
| Priority | High. MVP. |
| Estimated effort | 5 hours |
| Dependencies | TICKET-006 |

## User story

As a reviewer, I want to approve one recommendation and see the simulated SAP document change, and I want the other actions to leave the original invoice alone when they should.

## Context

Action semantics are in [solution-overview.md](../architecture/solution-overview.md) and [ADR 0003](../adr/0003-subsequent-credit-for-price-variance.md). The advisor cannot call these actions.

## Scope

- Implement `releasePaymentBlock`, `postSubsequentCredit`, `prepareSupplierContact`, and `dismissInvestigation` on `InvestigationService`.
- Wire the four buttons on the detail view. Enable a write button only when it matches `recommendedAction` or, for dismiss, whenever the case is `awaiting_review`. Contact is enabled when the recommendation is `contact_supplier` or whenever an email exists. Dismiss asks for a reason and refuses an empty reason.
- Release: recompute variance, require the policy to allow `release_payment_block`, require a non-empty `PaymentBlockingReason`, set that field to empty, write the decision, close the case with that outcome. The simulated operation is function import `Release` with `SupplierInvoice`, `FiscalYear`, and `DiscountDaysHaveToBeShifted` false.
- Subsequent credit: recompute variance, require the policy to allow it, insert a new supplier invoice with a new number, `SupplierInvoiceIsCreditMemo` `X`, item pointing at the same purchase order and item, quantity equal to the invoiced quantity, amount equal to the price difference, `IsSubsequentDebitCredit` `X`. Leave the original invoice's payment block in place. Store the new number on the decision. Close the case.
- The UI text for subsequent credit states that a new subsequent credit was posted and the original invoice was not modified and remains blocked.
- Contact: load the email from the business partner tool, store `emailDraftTo` and `emailDraftBody` on a decision, keep status `awaiting_review`. The draft mentions the invoice reference, the quantity or price difference, and asks the supplier to confirm. It is not sent.
- Dismiss: required reason, decision row, status `closed`, outcome `dismiss`, no `sap.sim` update.
- A second call after close returns the existing decision and does not insert another credit or clear a block that is already clear.

## Out of scope

Sending email, releasing the original block after a subsequent credit, payment run, reversal. The handler comment names function import `Release` and states that the demo does not call a SAP host.

## Implementation requirements

- Server-side checks. Disabled buttons are not the control.
- New subsequent-credit numbers come from a local sequence starting at `5100002001`, fiscal year copied from the original. They are demo document numbers, not SAP number-range objects. Say that in the UI.
- Actor string is a text field defaulting to `local.reviewer`, max 80 characters.
- `action_in_progress` is set at the start of release and subsequent credit and cleared to `closed` or back to `awaiting_review` if the policy check fails.
- Contact and dismiss do not use `action_in_progress` for more than the request, or they may skip it. The visible result is what the acceptance criteria check.

## SAP documentation

KBA 3778193 and KBA 3439469 for release. SAP Learning subsequent debit/credit lesson cited in [sap-reference.md](../architecture/sap-reference.md). KBA 3838004 for why the subsequent flag is item-level. The local boolean remains the stand-in.

## Expected artifacts

Action handlers, UI buttons, tests for all four actions and for a rejected mismatched action.

## Acceptance criteria

- [ ] Approving release on `5100001003` clears `PaymentBlockingReason` and closes the case. A second approve does not create a second decision.
- [ ] Approving subsequent credit on `5100001001` inserts a new invoice, `SupplierInvoiceIsCreditMemo` `X`, item amount `20.00`, quantity `10`, `IsSubsequentDebitCredit` `X`, same purchase order `4500001001` item `10`. The original `5100001001` still has payment block `A`, item amount `100.00`, and an empty `IsSubsequentDebitCredit`.
- [ ] Calling release for `5100001001` or `5100001002` is rejected and the simulated invoice is unchanged.
- [ ] Calling subsequent credit for `5100001002` is rejected.
- [ ] Contact on `5100001002` stores a draft to `ap@helios-fasteners.example` and leaves the case `awaiting_review` and the invoice blocked.
- [ ] Dismiss with a reason closes the case and leaves `PaymentBlockingReason` as it was.
- [ ] Dismiss with an empty reason is rejected.
- [ ] No action is exposed on `AgentToolService`.

## Test cases

- Each acceptance criterion as an HTTP test against the service, plus one UI check that the subsequent-credit confirmation text says the original invoice remains blocked.
- Agent tool list snapshot does not include release or create.

## Demo value

Completes the vertical slice: event, case, agent, evidence, human approval, simulated write, history row on the case.

## Risks

The schema does not publish the allowed character for `IsSubsequentDebitCredit`. The demo uses `X`. The UI calls the document a subsequent credit. It can show the field name beside the value.
