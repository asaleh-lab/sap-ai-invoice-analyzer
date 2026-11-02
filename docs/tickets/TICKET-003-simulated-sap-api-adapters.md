# TICKET-003: Simulated SAP read APIs

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-003 |
| Title | Read-only agent tools over the seeded documents |
| Priority | High. MVP. |
| Estimated effort | 4 hours |
| Dependencies | TICKET-002 |

## User story

As the investigation agent, I want to call one tool per SAP read and get a stable JSON document, so I can decide what to look at without a pre-built context object.

## Context

Tool contracts are in [tool-catalog.md](../architecture/tool-catalog.md). This ticket implements `AgentToolService` as CAP functions. It does not run an LLM.

## Scope

- Six functions: supplier invoice, purchase order, goods receipts, supplier invoice history, business partner, variance.
- JSON shape and error codes from the tool catalog.
- Variance rules from the tool catalog, including gross amount excluded from the match and unit mismatch making `comparable` false.
- History filtered by `InvoicingParty`, top 20, headers only.
- Goods receipts filtered by purchase order, item, movement type `101`, reference type `B`. Empty list is HTTP success inside the JSON result, not an error.
- A short comment in the service handler listing the SAP API each function simulates.

## Out of scope

Release, subsequent credit, events, the advisor graph, UI. Handlers are TypeScript.

## Implementation requirements

- Functions are the only entry. They read `sap.sim` through CAP queries.
- `calculateInvoiceVariance` loads the invoice, the purchase order, and the goods receipts itself. It does not trust amounts from the caller.
- Decimal strings in the JSON output, as in the catalog examples.
- Unknown keys return the catalog error object and HTTP 404. Missing arguments return HTTP 400.
- If an EDMX file is added later, this ticket does not block on it. Pending field names stay as in the data model. Add a `docs/architecture/edmx-gaps.md` note only if a name in the catalog is found to be wrong while implementing. Do not silently rename a verified field.

## SAP documentation

Supplier invoice, purchase order, material document, and business partner sections of [sap-reference.md](../architecture/sap-reference.md). KBA 3644600 for the filtered invoice read. KBA 3562938 for movement type 101 and `GoodsMovementRefDocType` `B`.

## Expected artifacts

`srv/agent-tools.cds`, `srv/agent-tools.ts`, unit tests beside the handler.

## Acceptance criteria

- [ ] `getSupplierInvoice` for `5100001001` / `2026` returns the PO reference item and payment block `A`.
- [ ] `getPurchaseOrder` for `4500001001` returns net price `8.00` and order quantity `10`.
- [ ] `getGoodsReceipts` for that item returns quantity `10`. The same call for invoice `5100001002`'s item returns quantity `8`.
- [ ] `getSupplierInvoiceHistory` for `17300001` includes `5100000900` and the three blocked invoices, and does not require items in the payload.
- [ ] `getSupplierBusinessPartner` returns the email `ap@helios-fasteners.example`.
- [ ] `calculateInvoiceVariance` for `5100001001` returns `priceDifference` `20.00`, `quantityDifference` `0`, `comparable` true, and `grossAmountExcludedFromMatch` true.
- [ ] Variance for `5100001002` returns quantity difference `2` (invoiced minus received) and price difference `0.00`.
- [ ] Variance for `5100001003` returns both differences `0`.
- [ ] Unknown invoice returns `NOT_FOUND`.
- [ ] A goods-receipt query with no rows returns an empty `items` array and does not return `NOT_FOUND`.

## Test cases

- The three seeded invoices through variance.
- History contains four headers for supplier `17300001`.
- Omitted `FiscalYear` returns `BAD_REQUEST`.
- Direct POST to `SimulatedS4Service` still rejected (regression from ticket 002).

## Demo value

`curl` against `/agent-tools` shows a three-way comparison before any model is involved.

## Risks

Quantity difference sign must stay "invoiced minus received" everywhere. A reversed sign would recommend the wrong action in ticket 005.
