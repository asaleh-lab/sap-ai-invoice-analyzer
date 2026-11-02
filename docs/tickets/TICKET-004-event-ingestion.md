# TICKET-004: Event ingestion and investigation case

**Status:** done

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-004 |
| Title | Supplier invoice created event and one open case per blocked invoice |
| Priority | High. MVP. |
| Estimated effort | 4 hours |
| Dependencies | TICKET-003 |

## User story

As the demo publisher, I want to POST a supplier invoice created event. The workbench reads that invoice, and when the invoice is blocked it opens one investigation that carries the payment block reason from the invoice. A second delivery leaves that investigation alone.

## Context

Contract: [event-contracts.md](../architecture/event-contracts.md). The event identifies the supplier invoice. The consumer calls `getSupplierInvoice`. When `PaymentBlockingReason` is set, that supplier invoice is blocked and the investigation copies that value into `paymentBlockingReason`. When the reason is empty, or the invoice is missing, the inbox row is rejected and no case opens. The agent is not called yet. New cases stay in status `open`.

## Scope

- `POST /simulated-events` accepting the CloudEvent JSON. This route is the simulated Event Mesh topic. The inbox row is the queue.
- Inbox statuses and duplicate rules from the event contract.
- Create `invc.Investigations` only after the invoice read shows a payment block. Copy list fields from that read: supplier, supplier invoice reference (`SupplierInvoiceIDByInvcgParty`), gross amount, currency, `PaymentBlockingReason` into `paymentBlockingReason`, status `open`. The event payload does not supply the reason.
- Copy `projectTolerance` `0.50` onto the case.
- Drain `received` rows after the HTTP response is committed. In-process is enough (CAP `cds.spawn` or equivalent). Document the hook in a short comment.
- `GET` on `InvestigationService` investigations and inbox for later UI.

## Out of scope

Agent invocation, recommendations, UI, writes to `sap.sim`.

## Implementation requirements

- Persist the inbox row before investigation work. Handler returns `202` with `{ "inboxId", "status" }` when the row is stored, including `invalid` when the body was stored as invalid. A completely unreadable body may return `400` without a row.
- Unique `EventInbox.id`.
- Before insert of an investigation, reject when another row for the same `supplierInvoice` and `fiscalYear` has status other than `closed`.
- Invoice read uses the ticket 003 function, not a duplicated query in the controller, unless the function's HTTP wrapper is awkward to call in-process. In that case share the query module. Do not fork the field list.
- Attempt count starts at 1 for a new id. A retry of `failed` increments it. This ticket has no `failed` path yet except an unexpected exception, which sets inbox `failed` and stores `errorMessage`.
- Log line includes the event id and inbox status. Do not log a future API key.

## SAP documentation

Event section of [sap-reference.md](../architecture/sap-reference.md). The accepted type is `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1`. A payment-block event type is not added.

## Expected artifacts

`srv/events.ts`, route registration, tests with the sample ids in the event contract.

## Acceptance criteria

- [x] POST of the sample CloudEvent for `5100001001` / `2026` creates one investigation in `open`, and the inbox status becomes `processed`.
- [x] The investigation shows invoicing party `17300001`, currency `EUR`, gross `119.00`, payment block `A`, and supplier reference `HF-2026-441`.
- [x] Repeating the same `id` returns the duplicate outcome and does not insert a second investigation.
- [x] A new id for `5100001001` while that case is open returns `duplicate_open_case` and still one investigation.
- [x] An unknown invoice id returns inbox `rejected` and no investigation.
- [x] A well-formed created event for `5100000900` returns `rejected` and no investigation, because the invoice read shows an empty `PaymentBlockingReason`.
- [x] The investigation for `5100001001` stores payment block reason `A` taken from that invoice read.
- [x] A body without `data.FiscalYear` is `invalid`.
- [x] A type other than `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1` is `invalid` and does not open a case. Document that in the handler comment.
- [x] Restarting the process does not drop the inbox row when the SQLite file path is used.

## Test cases

The table "Sample outcomes used by tests" in the event contract, plus the payment-block check on `5100000900`.

## Demo value

First half of the vertical slice: event to case, with duplicate delivery visible in the inbox entity.

## Risks

Race of two different ids at the same time. MVP may serialize the consumer on one process. The acceptance test can be sequential. Mention the limit in a code comment.
