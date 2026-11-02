# TICKET-002: CDS model and seed data

**Status:** ready-for-agent

**Commit:** Finish this ticket, then commit its code-relevant files before the next ticket. One ticket, one commit. See `AGENTS.md`.

| | |
| --- | --- |
| Ticket ID | TICKET-002 |
| Title | Simulated SAP documents and empty investigation model |
| Priority | High. MVP. |
| Estimated effort | 4 hours |
| Dependencies | TICKET-001 |

## User story

As a developer, I want the simulated invoices, purchase orders, goods receipts, and suppliers in SQLite, so later APIs and the advisor have real rows to read.

## Context

The model is specified in [data-model.md](../architecture/data-model.md). Field names follow [sap-reference.md](../architecture/sap-reference.md). Do not add SAP fields that the reference does not list.

## Scope

- `sap.sim` and `invc` CDS as specified, including `IsSubsequentDebitCredit` as `String(1)`.
- Business partner email row for `17300001`: `AddressID` `1730000101`, `Person` `1730000102`, `OrdinalNumber` `001`, email `ap@helios-fasteners.example`. Those three keys are demo values. They follow the `A_AddressEmailAddress` key shape.
- Projections `SimulatedS4Service` (`@readonly`) and `InvestigationService` (entities only, no actions yet).
- CSV seed for the three blocked invoices, one historical unblocked invoice, their purchase orders, material documents, and business partner `17300001` Helios Fasteners GmbH with contact email `ap@helios-fasteners.example`.
- Seed numbers from [tool-catalog.md](../architecture/tool-catalog.md):
  - `5100001001` / `2026`: item amount `100.00`, quantity `10` PC, PO `4500001001` item `10` net price `8.00` per `1` PC, order quantity `10`, goods receipt `5000001001` / `2026` movement `101` quantity `10` PC. `PaymentBlockingReason` `A`. Gross `119.00`. Supplier reference `HF-2026-441`.
  - `5100001002` / `2026`: item amount `80.00`, quantity `10` PC, PO net `8.00`, goods receipt quantity `8` PC. Gross `95.20`. `PaymentBlockingReason` `A`.
  - `5100001003` / `2026`: item amount `80.00`, quantity `10`, receipt quantity `10`, PO net `8.00`. Gross `95.20`. `PaymentBlockingReason` `A`.
  - `5100000900` / `2026`: posted earlier, `PaymentBlockingReason` empty, same supplier, amount `40.00`, quantity `5`, matching PO and receipt. Used only as history.
- Company code `1010`, currency `EUR`, plant `1010`, material `FASTENER-M8`, invoicing party `17300001`.
- `SupplierInvoiceStatus` is `5` on every seeded invoice. That value is an opaque sample seen in a third-party capture of this API. The UI must not translate it. `SupplierInvoiceIsCreditMemo` is empty on seeded rows.
- `projectTolerance` is not seeded on a case yet. The constant `0.50` lives in one module the later tickets import.

## Out of scope

Event consumer, agent, UI, write actions, EDMX import.

## Implementation requirements

- Compositions so a deep read of an invoice returns items.
- Simulated S/4 service rejects POST, PATCH, and DELETE (CAP `@readonly`).
- Amounts in CSV match the variance examples exactly: price case difference `20.00`, quantity case received `8` against invoiced `10`, match case difference `0.00`.
- Document dates in October 2026, receipt posting date on or before the invoice posting date.
- No investigation rows in the seed. The inbox is empty at startup.

## SAP documentation

[sap-reference.md](../architecture/sap-reference.md). CAP compositions: https://cap.cloud.sap/docs/cds/cdl

## Expected artifacts

`db/schema.cds` (or split `db/sap-sim.cds` and `db/investigation.cds`), `srv/simulated-s4.cds`, `srv/workbench.cds`, `db/data/*.csv`.

## Acceptance criteria

- [ ] After `cds deploy` or `cds watch`, OData read of supplier invoice `5100001001` / `2026` returns item amount `100.00`, purchase order `4500001001`, and `PaymentBlockingReason` `A`.
- [ ] The purchase order item `10` returns net price `8.00` and quantity `10`.
- [ ] The material document item for that PO item returns movement type `101` and quantity `10`.
- [ ] Invoice `5100001002` has receipt quantity `8`.
- [ ] Invoice `5100000900` has an empty payment block reason.
- [ ] Business partner `17300001` returns the name Helios Fasteners GmbH and the example email.
- [ ] POST to the simulated supplier invoice entity set is rejected.
- [ ] `IsSubsequentDebitCredit` is empty on every seeded item.

## Test cases

- Deep GET of each seeded invoice.
- GET purchase order, material document, and business partner by key.
- Assert CSV arithmetic: `8.00 * 10 = 80.00`, and `100.00 - 80.00 = 20.00`.
- Assert the readonly service does not accept a create.

## Demo value

A reviewer can open OData and see SAP-shaped documents without credentials.

## Risks

CAP CSV names must match entity and key columns. Supplier invoice, purchase order, material document, and business partner names come from the files in `metadata/`. `NetPriceAmount` is decimal 12.3 and `NetPriceQuantity` is decimal 5.0, as in the purchase order schema.
