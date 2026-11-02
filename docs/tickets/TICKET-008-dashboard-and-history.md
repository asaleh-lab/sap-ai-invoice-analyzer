# TICKET-008: History and dashboard

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-008 |
| Title | Processed history and summary counts |
| Priority | Medium. Optional for the first demo. |
| Estimated effort | 3 hours |
| Dependencies | TICKET-007 |

## User story

As a reviewer, I want to see cases I have already closed and a few counts, so the workbench looks like a queue and not a single-page demo.

## Context

The financial path already works after ticket 007. This ticket must not change action rules.

## Scope

- History table of investigations with status `closed`: supplier, invoice reference, amount, currency, outcome, closed time.
- Counts: pending investigations (not `closed`), closed investigations, and count of pending cases grouped by supplier name.
- Outcome counts: released, subsequent credit posted, dismissed.
- Contact drafts are not closed cases. They stay on the pending detail view. The dashboard may show a number of stored drafts as an extra count if it is a one-line query. It is optional.
- The supplier with the highest pending count is highlighted in the list of suppliers. With the seed, Helios Fasteners is the only supplier, so the grouping still works when a second supplier is added in a test.

## Out of scope

Charts library, date filters, exporting, changing a closed case, email sending.

## Implementation requirements

- Read models are OData queries or a single CAP function `workbenchSummary` returning the counts. Prefer one function so the UI does not assemble business rules.
- Pending count includes `awaiting_review`, `open`, `investigating`, `investigation_failed`, and `action_in_progress`.
- History is ordered by `closedAt` descending.

## SAP documentation

None beyond the outcome names already defined. Do not describe a closed investigation as a cleared SAP payment.

## Expected artifacts

Summary function, history view in the React app, tests for counts after the three actions.

## Acceptance criteria

- [ ] After release, subsequent credit, and dismiss on the three seeded cases, pending count is `0` and processed count is `3`.
- [ ] Outcome counts are one release, one subsequent credit, and one dismiss.
- [ ] History shows the three invoice references and does not show an open case.
- [ ] If only the price case is closed, pending count is `2` and Helios Fasteners is listed with pending count `2`.
- [ ] A contact draft alone does not reduce the pending count.

## Test cases

- Service test builds the summary from fixture cases.
- UI test renders the three outcome labels from a mocked summary.

## Demo value

Gives the third region of the workbench after the main story already runs.

## Risks

None that affect the SAP semantics if the summary is read-only.
