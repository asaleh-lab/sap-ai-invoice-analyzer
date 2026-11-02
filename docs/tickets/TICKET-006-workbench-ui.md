# TICKET-006: Pending investigations and detail view

**Status:** done

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-006 |
| Title | Workbench list and investigation detail |
| Priority | High. MVP. |
| Estimated effort | 5 hours |
| Dependencies | TICKET-005 |

## User story

As a reviewer, I want a list of blocked invoices waiting for me, and a detail page that shows the SAP context, the recommendation, and the evidence, so I can judge the case before I act.

## Context

Actions themselves are ticket 007. This ticket renders the buttons disabled, or hides them, and shows the recommendation. History and dashboard are ticket 008. The list is cases in `awaiting_review`, `open`, `investigating`, and `investigation_failed`.

## Scope

- Fiori elements app in `app/`, SAPUI5 1.144, served by the CAP app at `http://localhost:4004`. List report for the pending queue and object page for one investigation. Versions are in [solution-overview.md](../architecture/solution-overview.md).
- Pending list columns: supplier name (from the business partner read or from a field expanded via the investigation's invoicing party), supplier invoice reference, gross amount, currency, payment block reason, calculated block category, investigation status.
- Block category is derived in the UI or by a small read-only function from the stored differences:
  - quantity difference not zero → `quantity`
  - absolute price difference above tolerance → `price`
  - both zero → `manual block`
  - variance not comparable → `unresolved`
  Label the column so a reviewer can see it is calculated. Show the raw `PaymentBlockingReason` in its own column.
- Detail: invoice header, PO reference items, variance figures, narrative, findings grouped by fact / assumption / missing, evidence table with api, entity, field, and value.
- Empty state when no cases exist, with the `curl` or button hint for posting a sample event. A "Send sample events" button may POST the three CloudEvents from the UI. That is the demo publisher and belongs here.
- Failed investigations show the error and a Retry button that calls `retryInvestigation`.

## Out of scope

Release, subsequent credit, dismiss, email draft persistence, dashboard charts, authentication.

## Implementation requirements

- Load data from `InvestigationService` OData through Fiori elements annotations. Do not hardcode the three outcomes as the only UI state. The seed scenarios are fixtures, not a filter baked into the floorplan.
- Supplier name: either expand a convenience projection added in this ticket (`supplierName` filled when the case is created) or call the simulated business partner from the UI. Prefer storing `supplierName` on the investigation at creation time so the list is one query. That is a small additive field on `invc.Investigations`, set in the consumer from `BusinessPartnerName`.
- Currency and amount formatted with the document currency code. No FX.
- The page title states the data is simulated S/4HANA Cloud data.
- Keyboard focus order: list, then detail. Status text is text, not color alone.

## SAP documentation

Field meanings in [sap-reference.md](../architecture/sap-reference.md). Do not relabel `PaymentBlockingReason` as the calculated category.

## Expected artifacts

`app/` Fiori elements app, list report and object page annotations, the sample-event action.

## Acceptance criteria

- [x] After the three sample events are processed, the pending list shows three rows with supplier Helios Fasteners GmbH, the three references, amounts `119.00`, `95.20`, and `95.20`, currency `EUR`, payment block `A`, and statuses `awaiting_review`.
- [x] Block categories are `price`, `quantity`, and `manual block` respectively.
- [x] Opening `5100001001` shows narrative, price difference `20.00`, and an evidence row for `SupplierInvoiceItemAmount`.
- [x] Opening `5100001002` shows quantity difference `2` and does not show a recommendation of release or subsequent credit.
- [x] The simulated-data notice is visible on the list.
- [x] Retry is available on `investigation_failed` and absent on `awaiting_review`.
- [x] An empty database shows the empty state rather than a blank table.

## Test cases

- Component or end-to-end test with a mocked OData payload for one price case and one empty list.
- If a browser tool is available during implementation, click from the list into the price case and confirm the evidence field name is visible.
- Sample-event button posts three times and the list grows to three. A second click does not create three more open cases (duplicate rules from ticket 004).

## Demo value

The workbench is visible. The financial action is still a later ticket, so this slice is safe to show as "recommendation only".

## Risks

The list report and the CAP service must share one URL in Compose (`http://localhost:4004`). Test the list there.
