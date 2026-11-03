# TICKET-010: Invoice publisher and multi-supplier history

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-010 |
| Title | Publisher screen, scenario templates, and a multi-supplier seed |
| Priority | High for the demo. The scripted Helios path stays valid. |
| Estimated effort | 6 hours |
| Dependencies | TICKET-002 for the document model. TICKET-004 for `POST /simulated-events`. The workbench link can be a plain URL until TICKET-006 exists. |

## User story

As someone trying the demo, I want a screen that creates a new supplier invoice from a clear scenario and files it the way SAP would, so a case shows up in the workbench without curl and without being limited to one supplier.

## Context

Decision: [ADR 0007](../adr/0007-publisher-ui-and-multi-supplier-seed.md). The event contract does not change. The publisher writes simulated documents, then posts the created event. The consumer still reads the invoice and opens a case only when `PaymentBlockingReason` is set.

Ticket 008 groups pending cases by supplier. This ticket is what makes that list more than Helios Fasteners. Ticket 008 does not change action rules, and neither does this one.

## Scope

- A publisher UI, separate from the workbench, served by the same CAP app. One action per template: price variance, quantity variance, matching documents with a payment block, and a created event for an invoice with no payment block.
- Each action inserts a purchase order, a goods receipt (movement type 101), and a posted supplier invoice, then POSTs `POST /simulated-events` with a new CloudEvents id. Show the scenario, the new invoice number, the fiscal year, and whether a case was opened. Link to the workbench.
- Amounts and quantities come from the template. The supplier is chosen from the seeded partners, varying across clicks so the same partner is not used every time. Do not accept typed prices or quantities.
- Seed several suppliers besides Helios Fasteners GmbH (`17300001`). Each has a contact email, older posted invoices, and the purchase orders and goods receipts those invoices reference. Mix blocked invoices (`PaymentBlockingReason` set) and at least one unblocked invoice per supplier so `getSupplierInvoiceHistory` is non-empty and not only blocked rows.
- Keep the four Helios documents `5100001001`, `5100001002`, `5100001003`, and `5100000900` with their current variance stories.
- No investigation rows and no inbox rows in the seed.

## Out of scope

Changing event types, release, subsequent credit, dismiss, a chart of the top ten customers, free-form invoice entry, and a real Event Mesh broker.

## Implementation requirements

- Document inserts go through the same simulated entities the read tools already use. Do not add a second invoice store.
- The CloudEvent payload carries only the invoice key and fiscal year, as in [event-contracts.md](../architecture/event-contracts.md).
- Every event this ticket posts is valid, envelope and data. `specversion`, `type`, `id`, `source`, and `data.SupplierInvoice` / `data.FiscalYear` are present and consistent. The invoice named in the event is already stored, with its purchase order and goods receipt, before the POST. The inbox never stores `invalid` or `rejected` because the invoice key is missing or the documents do not line up. A reviewer who opens a case from a publisher click sees a complete invoice, not a data error.
- The only publisher outcome that does not open a case is the unblocked template: the event and the documents are still valid, `PaymentBlockingReason` is empty, the inbox is `rejected`, and no investigation opens.
- Do not add a retry for bad event data. The workbench Retry button stays only for processing failures (`failed` / `investigation_failed`), which are not caused by the payload or the documents.
- New invoice numbers must not collide with seeded ids or with each other in one SQLite file.
- A second publisher action that would reuse an open invoice follows the ticket 004 duplicate rule and does not insert a second investigation.
- The unblocked template leaves the inbox `rejected` and creates no investigation.
- `SupplierInvoiceStatus` stays the opaque seeded value. The publisher UI does not translate it.
- Page title states that the documents are simulated S/4HANA Cloud data.

## SAP documentation

Same boundaries as [ADR 0002](../adr/0002-local-inbox-instead-of-event-mesh.md) and the event section of [sap-reference.md](../architecture/sap-reference.md). No payment-block event type.

## Expected artifacts

Publisher UI, template module, expanded CSV seed, tests that one click per template writes the three documents and posts one event.

## Acceptance criteria

- [ ] The seed contains Helios Fasteners plus at least four other suppliers, and each supplier has more than one posted invoice.
- [ ] For every seeded supplier, history includes at least one invoice with an empty `PaymentBlockingReason` and at least one with a payment block, each with a purchase order and a goods receipt.
- [ ] No investigation or inbox row exists at startup.
- [ ] Choosing price variance creates documents where the invoiced amount is above the purchase-order net, the quantity matches the goods receipt, and `PaymentBlockingReason` is set. One investigation opens.
- [ ] Choosing quantity variance creates documents where the invoiced quantity is above the goods receipt, the price matches the purchase order, and a payment block is set. One investigation opens.
- [ ] Choosing the matching template creates documents with no price or quantity difference and a payment block set. One investigation opens.
- [ ] Choosing the unblocked template creates an invoice with an empty `PaymentBlockingReason`. The inbox row is `rejected`. No investigation opens.
- [ ] Repeating the post for an invoice that already has an open case does not add a second investigation.
- [ ] The publisher screen shows the new invoice id and a way to open the workbench. It does not offer release, subsequent credit, or dismiss.
- [ ] Each publisher action stores the invoice, purchase order, and goods receipt first, then posts one valid event for that key. The inbox status is `processed`, `duplicate_open_case`, or `rejected` only for an empty payment block. It is never `invalid`, and never `rejected` because the invoice is missing.
- [ ] The publisher does not offer retry. Workbench Retry remains only for a case that failed while processing, not for invalid or rejected event data.

## Test cases

- Service test for each template: documents stored, event posted, investigation count is 1 or 0 as specified.
- Seed test: more than one supplier, and history for a non-Helios supplier returns both a blocked and an unblocked invoice.
- If a browser tool is available, click one template and confirm the new invoice id is visible on the publisher screen.

## Demo value

A visitor can cause the next blocked invoice themselves and see that the queue is a set of suppliers, not a single scripted page.

## Risks

Template numbers that are only slightly off the purchase order can fall inside the project tolerance (`0.50`) and look like a match. The price template must exceed that tolerance by a wide margin.
