# TICKET-009: Demo path and documentation

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-009 |
| Title | End-to-end demo test and README walkthrough |
| Priority | High for the README and one end-to-end test. The broader test polish can follow ticket 008. |
| Estimated effort | 3 hours |
| Dependencies | TICKET-007 for the end-to-end test. TICKET-008 if the walkthrough mentions the dashboard. |

## User story

As someone opening this portfolio, I want a written walkthrough and one automated test of the full path, so I can run the demo without an SAP system and see what is simulated.

## Context

Earlier tickets own their unit tests. This ticket adds the path that must not regress, and it rewrites the README so the current placeholder setup is not the instructions.

## Scope

- One automated test, no live LLM: publish the price-variance event, wait until `awaiting_review`, call `postSubsequentCredit`, assert the new document and the unchanged original invoice, assert inbox duplicate on a second POST of the same event id.
- README sections listed in the project brief: purpose, architecture summary, local setup, how the simulation works, how to run the demo, what is SAP-aligned versus local, a short walkthrough of the three invoices, known limitations.
- The walkthrough uses the three sample event ids and the expected recommendations.
- Known limitations must include: no tenant, simulated Event Mesh, no official payment-block event (a created event is handled by reading `PaymentBlockingReason`), `IsSubsequentDebitCredit` uses `X` because the schema has no code list, no payment run, no Finance-only block, project tolerance is not SAP customizing, scripted advisor when no model key is set. The README stays in the same voice as the current one: what the two evenings are for, out-of-the-box SAP first, then the local fit.
- Link to `docs/architecture/solution-overview.md` and `docs/architecture/sap-reference.md`.

## Out of scope

New features, a hosted environment, SAP BTP deployment.

## Implementation requirements

- The end-to-end test uses the CAP test runner and the scripted advisor in the same process. It must not require Docker, but the README must document `docker compose up` as the demo path.
- README commands match the scripts from ticket 001.
- Do not tell the reader to add an SAP host, client, or communication user.

## SAP documentation

Point the reader at the SAP reference rather than restating every API.

## Expected artifacts

`test/` or `srv/test` end-to-end file, updated `README.md`.

## Acceptance criteria

- [ ] The end-to-end test passes with `LLM_API_KEY` unset.
- [ ] The test fails if the original invoice's item amount or payment block changes during subsequent credit.
- [ ] README states the app is a local simulation and names `API_SUPPLIERINVOICE_PROCESS_SRV`, `API_PURCHASEORDER_PROCESS_SRV`, `API_MATERIAL_DOCUMENT_SRV`, and `API_BUSINESS_PARTNER` as the contracts being simulated.
- [ ] README walkthrough tells the reviewer which invoice gets a subsequent credit, which one stays blocked while a draft is prepared, and which one can be released.
- [ ] README setup does not require SAP credentials.

## Test cases

The end-to-end test is the test case. Also read the README once against `docker-compose.yml` and `.env.example` so the environment variable names match.

## Demo value

A visitor can follow the README on a laptop.

## Risks

The end-to-end test becomes slow if it boots Compose. Keep it in-process.
