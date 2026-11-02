# SAP reference

Retrieved 2 November 2026. This file records what was checked against SAP sources, and where a contract could not be opened.

The target product is **SAP S/4HANA Cloud Public Edition**. The Business Accelerator Hub catalog for package `SAPS4HANACloud` lists the APIs below as inbound OData services. Versions are the catalog versions returned on that date.

Hub pages for a single API and for the event catalog redirected to sign-in during this research. Facts taken from the public catalog query are marked **Hub catalog**. Facts taken from SAP Help or an SAP Knowledge Base Article are marked **SAP Help / KBA**. Anything else is marked so it is not treated as the contract.

## Deployment choice

Public Edition is the coherent target because one communication-arrangement model covers the invoice, the purchase order, the material document, and the business partner.

| Choice | Why it was set aside |
| --- | --- |
| S/4HANA Cloud Public Edition | Selected. Released APIs, communication scenarios, and the same OData paths a side-by-side extension would call. |
| S/4HANA Cloud Private Edition or on-premise | May expose the same released API names, and also exposes unreleased or custom services. The on-premise Hub package uses names such as `OP_API_SUPPLIERINVOICE_PROCESS_SRV`. This demo does not follow that package. |
| SAP Business ByDesign | Different service names and payloads (`Query Supplier Invoices`, party nodes). Irrelevant to this scenario. |
| ECC BAPIs such as `BAPI_INCOMINGINVOICE_RELEASE` | Different protocol and product. The Public Edition successor used here is the OData supplier invoice API. |

A real tenant still needs a communication system, a communication user, and an active communication arrangement before any of these APIs answer. The catalog authentication label on each API below is `x509`. The local simulation has no SAP authentication.

Scope item **Procurement of Direct Materials (J45)** is the business story: a purchase order, a goods receipt, and a supplier invoice for a direct material. The same APIs are also listed for Consumable Purchasing (BNX). The demo seeds direct-material documents only.

## Verified APIs

### Supplier Invoice

| | |
| --- | --- |
| Official name | Supplier Invoice |
| API identifier | `API_SUPPLIERINVOICE_PROCESS_SRV` |
| Catalog version | 1.6.0 |
| Product | SAP S/4HANA Cloud Public Edition |
| Protocol | OData V2, synchronous, inbound |
| Path | `/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV` |
| Communication scenario | Supplier Invoice Integration (`SAP_COM_0057`) |
| Business object | Supplier Invoice |
| Hub URL | https://api.sap.com/api/API_SUPPLIERINVOICE_PROCESS_SRV/overview |
| Business documentation | https://help.sap.com/http.svc/ahp2/SAP_S4HANA_CLOUD/2608.latest/EN/7b/c52558ef790a02e10000000a44147b/frameset.htm |
| Read or write | Both. Catalog text: create supplier invoices, and read, release, reverse, and post existing supplier invoices. |

Documented operations and entities used by this design:

- Read one invoice: `GET .../A_SupplierInvoice(SupplierInvoice='{SupplierInvoice}',FiscalYear='{FiscalYear}')`. The key pair is used by SAP's own Build Process Automation package for this API.
- Read a filtered list: `GET .../A_SupplierInvoice` with `$filter` and `$top`. KBA 3644600 says an unfiltered GET can fail with `SYSTEM_NO_ROLL` because the result set is too large. The local history tool always filters by supplier.
- Purchase-order items are the navigation `to_SuplrInvcItemPurOrdRef`. An SAP Help test script for S/4HANA Cloud 2608 (Invoice Verification for Retail, 5FN) posts that navigation with `SupplierInvoiceItem`, `PurchaseOrder`, `PurchaseOrderItem`, `Plant`, `DocumentCurrency`, `ReferenceDocument`, `ReferenceDocumentFiscalYear`, `ReferenceDocumentItem`, `SupplierInvoiceItemAmount`, `PurchaseOrderQuantityUnit`, and `QuantityInPurchaseOrderUnit`. The same script shows header fields `InvoiceGrossAmount`, `TaxIsCalculatedAutomatically`, and `SupplierInvoiceIsCreditMemo`.
- An SAP-published automation package selects `SupplierInvoiceStatus`, `PaymentBlockingReason`, `DocumentDate`, `InvoiceGrossAmount`, `DocumentCurrency`, and `InvoicingParty`.

Release:

- KBA 3439469 (Public Edition) states this API can release an existing supplier invoice.
- KBA 3778193 (Public Edition) states that release fails with `MRM_BASE000` ("Invoice is not blocked and cannot be released therefore") when the invoice is not in the logistics blocked-invoice set (`RBKP_BLOCKED`), even if a payment block indicator is visible. Blocks set only in Finance are outside this API. The Fiori app Release Blocked Invoices (transaction MRBR) has the same boundary. An SAP Community blog, "What is the function of Release Blocked Invoices", describes the app procedures **Blocked Due to Variances**, **Manual Payment Block**, and **Stochastically Blocked**, and the same `RBKP_BLOCKED` limit.
- The OData action's technical name was not read from `$metadata` (the Hub specification and the sandbox `$metadata` both require authentication). The implementation must copy that name from the EDMX. This document does not treat integrator names for that action as verified.

Create for a subsequent credit uses the same create operation as any supplier invoice. KBA 2647639: the create payload must be a single entity. Header field `SupplierInvoiceIsCreditMemo` is in the SAP Help test script. The item-level subsequent-debit/credit indicator is documented for the internal RAP behavior `I_SupplierInvoiceTP` in KBA 3838004 as `suplrinvcissubsqntdebitcrdt`. That KBA says a header-level subsequent flag does not exist on that object. The external OData property name was not verified. Do not send the RAP field name to OData until the EDMX confirms it.

SOAP alternative, not used: `ECC_SUPLRINVCERPCRTRC` (`SupplierInvoiceERPCreateRequestConfirmation_In`), same communication scenario, for create including parked and held invoices. The demo stays on the OData API.

### Purchase Order

| | |
| --- | --- |
| Official name | Purchase Order |
| API identifier | `API_PURCHASEORDER_PROCESS_SRV` |
| Catalog version | 1.0.0 |
| Product | SAP S/4HANA Cloud Public Edition |
| Protocol | OData V2, synchronous, inbound |
| Path | `/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV` |
| Communication scenario | Purchase Order Integration (`SAP_COM_0053`) |
| Business object | Purchase Order |
| Hub URL | https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV/overview |
| Business documentation | https://help.sap.com/http.svc/ahp2/SAP_S4HANA_CLOUD/2608.latest/EN/ac/d2da57df6cc525e10000000a44147b/frameset.htm |
| Read or write | Both. Catalog text: create, read, update, and delete purchase orders. This demo only reads. |

KBA 3218443 identifies the item entity `A_PurchaseOrderItem`. KBA 2928975 identifies the item field `PurchaseOrderQuantityUnit` on `A_PurchaseOrderItemType`. Integrator and CDS-view examples also use `PurchaseOrder`, `PurchaseOrderItem`, `OrderQuantity`, `NetPriceAmount`, `NetPriceQuantity`, `DocumentCurrency`, `Material`, and `Supplier` on the header. Those extra names are **not confirmed from `$metadata` in this research**. Ticket 003 checks them against the EDMX before they are treated as the adapter contract. There is a newer OData V4 purchase order API (`api_purchaseorder_2`). This demo standardizes on the V2 service above so the stack matches the supplier invoice V2 service.

Purchase-order history (goods receipts and invoices already listed on the PO) is available on CDS view `I_PurchaseOrderHistoryAPI01`. That view is not assumed to be part of `API_PURCHASEORDER_PROCESS_SRV`. Goods receipts are read from the material document API instead.

### Material document (goods receipt)

| | |
| --- | --- |
| Official name | Material Documents - Read, Create |
| API identifier | `API_MATERIAL_DOCUMENT_SRV` |
| Catalog version | 1.5.0 |
| Product | SAP S/4HANA Cloud Public Edition |
| Protocol | OData V2, synchronous, inbound |
| Path | `/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV` |
| Communication scenario | Material Document Integration (`SAP_COM_0108`) |
| Business object | Material Document |
| Hub URL | https://api.sap.com/api/API_MATERIAL_DOCUMENT_SRV/overview |
| Business documentation | https://help.sap.com/http.svc/ahp2/SAP_S4HANA_CLOUD/2608.latest/EN/d4/c919581bc30a02e10000000a44147b/frameset.htm |
| Read or write | Both. This demo only reads. |

Catalog text: read and create material documents, including a goods receipt for a purchase order, and cancel a document or an item. SAP Cloud SDK documents the header entity `A_MaterialDocumentHeader` and the key `MaterialDocument` + `MaterialDocumentYear`.

KBA 3562938 gives a create payload for purchase-order goods movements: header `PostingDate`, `GoodsMovementCode` `01`, navigation `to_MaterialDocumentItem`, and items with `Material`, `Plant`, `GoodsMovementType` (`101` for goods receipt, also `103` and `105` in that KBA), `PurchaseOrder`, `PurchaseOrderItem`, `GoodsMovementRefDocType` `B`, `EntryUnit`, and `QuantityInEntryUnit`. KBA 3651756: `GoodsMovementRefDocType` `B` means the movement references a purchase order. Movement type 102 (reversal) is standard MM and was not re-quoted from a KBA in this pass. The demo seed posts 101 only.

There is no separate "goods receipt API" in this design. `SSPOPENITMGOODSRECEIPT_0001` (Goods Receipt Confirmations, OData V4, `SAP_COM_0782`) creates confirmations for purchase orders that came from purchase requisitions in Guided Buying. Its business object is Purchase Requisition. It is the wrong API for reading a posted goods receipt.

### Business Partner (supplier)

| | |
| --- | --- |
| Official name | Business Partner (A2X) |
| API identifier | `API_BUSINESS_PARTNER` |
| Catalog version | 1.7.0 |
| Product | SAP S/4HANA Cloud Public Edition |
| Protocol | OData V2, synchronous, inbound |
| Path | `/sap/opu/odata/sap/API_BUSINESS_PARTNER` |
| Communication scenario | Business Partner, Customer and Supplier Integration (`SAP_COM_0008`) |
| Business object | Business Partner |
| Hub URL | https://api.sap.com/api/API_BUSINESS_PARTNER/overview |
| Business documentation | https://help.sap.com/http.svc/ahp2/SAP_S4HANA_CLOUD/2608.latest/EN/85/043858ea0f9244e10000000a4450e5/frameset.htm |
| Read or write | Both. KBA 3569467 describes CRUD for business partner, supplier, and customer. This demo only reads. |

The supplier is a business partner with a supplier role. SAP Cloud SDK documents `A_BusinessPartner` and navigation `to_Supplier` to `A_Supplier`, whose key `Supplier` is the supplier number. The invoice field `InvoicingParty` is the supplier on the invoice.

Contact and email, from SAP KBAs and the SAP Developer Center CAP tutorial for this API:

- `A_BusinessPartnerContact` identifies a contact relationship (`BusinessPartnerCompany`, `BusinessPartnerPerson`, `RelationshipNumber`).
- `A_AddressEmailAddress` carries `AddressID` and `EmailAddress`.
- KBA 3392200: navigation `to_ContactAddress` on the contact supports read, and workplace address cannot be created through this API. The demo only reads email.

The supplier master also has its own purchasing block (`purchasingIsBlocked` on `A_Supplier` in the Cloud SDK). That is a master-data block, separate from an invoice payment block.

## Business objects and the fields this demo is allowed to show

Only fields cited above may be presented as SAP fields. Calculated block categories, tolerances, and investigation data are project fields.

| Object | Identity | Fields used as SAP fields |
| --- | --- | --- |
| Supplier invoice header | `SupplierInvoice`, `FiscalYear` | `CompanyCode`, `DocumentDate`, `PostingDate`, `InvoicingParty`, `DocumentCurrency`, `InvoiceGrossAmount`, `PaymentBlockingReason`, `SupplierInvoiceStatus`, `SupplierInvoiceIDByInvcgParty`, `SupplierInvoiceIsCreditMemo`, `TaxIsCalculatedAutomatically` |
| Supplier invoice PO item | invoice key + `SupplierInvoiceItem` | `PurchaseOrder`, `PurchaseOrderItem`, `Plant`, `DocumentCurrency`, `SupplierInvoiceItemAmount`, `QuantityInPurchaseOrderUnit`, `PurchaseOrderQuantityUnit`, `ReferenceDocument`, `ReferenceDocumentFiscalYear`, `ReferenceDocumentItem` |
| Purchase order header | `PurchaseOrder` | `Supplier`, `CompanyCode`, `DocumentCurrency` pending EDMX check |
| Purchase order item | `PurchaseOrder` + `PurchaseOrderItem` | `OrderQuantity`, `PurchaseOrderQuantityUnit`, `NetPriceAmount`, `NetPriceQuantity`, `Material` pending EDMX check. `PurchaseOrderQuantityUnit` is KBA-verified. |
| Material document header | `MaterialDocument` + `MaterialDocumentYear` | `PostingDate`, `GoodsMovementCode`, `ReferenceDocument` |
| Material document item | header key + `MaterialDocumentItem` | `GoodsMovementType`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsMovementRefDocType`, `QuantityInEntryUnit`, `EntryUnit`, `Material`, `Plant` |
| Business partner | `BusinessPartner` | `BusinessPartnerName`, `Supplier` |
| Address email | `AddressID` + person + ordinal, exact key pending EDMX | `EmailAddress` |
| Contact relationship | relationship key pending EDMX | `BusinessPartnerCompany`, `BusinessPartnerPerson` |

`InvoiceGrossAmount` includes tax. Price comparison uses `SupplierInvoiceItemAmount` against the purchase-order net price. The demo does not invent a tax-code breakdown for the match.

`PaymentBlockingReason` values are configuration. An SAP blog example uses `A` for "Blocked for payment". The demo may store `A` as sample data. It must not publish a private code list as if it were the SAP standard.

`SupplierInvoiceStatus` codes were not taken from a code list in this research. A community reply from SAP says `A` parks an invoice and `B` parks and completes it. The demo seed uses posted invoices and stores the raw status without decoding it until a code list is checked.

## Events

### What was verified

SAP Help for S/4HANA Cloud Public Edition 2608 describes **Enterprise Event Enablement**: the system exchanges business events with another product, and the help text names SAP Event Mesh as the example. Applications consume events for business objects, and event logs can be viewed and extracted.

An SAP-published integration guide on the Hub shows the payload shape actually used for S/4 business events. The example is a business partner change, and it is a CloudEvents 1.0 envelope:

- `specversion`: `1.0`
- `type`: `sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1`
- `source`: an S/4 logical system path such as `/default/sap.s4.beh/0000000007`
- `id`, `time`, `datacontenttype`
- `data`: the business-object key only (`BusinessPartner`), after which the consumer calls the OData API

An SAP Help administration guide for another product shows the topic pattern `/sap/s4/beh/serviceorder/v1/ServiceOrder/Created/v1`. That is evidence of the topic pattern, for a different business object.

The event catalog entity on `api.sap.com` required sign-in in this session. No official supplier-invoice event type was read from that catalog.

### What is not claimed

- There is no verified event named Supplier Invoice Blocked, Payment Block Changed, or similar.
- Third-party pages mention `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1`. That string was not confirmed on an SAP page retrieved here, so the demo does not emit it.
- On-premise event package `SAPS4HANABusinessEvents_SupplierInvoiceEvents` exists as a Hub URL and is described by third parties as the on-premise package. It is not the Public Edition contract.

The demo therefore publishes a **synthetic event**, specified in [event-contracts.md](event-contracts.md). Its CloudEvents envelope follows the verified shape. Its `type` is deliberately outside the `sap.s4.beh` namespace. Its `data` carries the supplier invoice key only, which matches the verified key-only pattern, and the consumer must read the invoice API before it decides the invoice is blocked.

SAP Event Mesh queue quality of service was not re-read from Help in this session. The local inbox still treats delivery as at-least-once, because that is the failure mode a consumer of business events has to survive. The exact Event Mesh QoS enum is not copied into this design.

## CDS and CAP

Official CAP documentation used:

- SQLite for local development, including `cds add sqlite` and in-memory SQLite for tests: https://cap.cloud.sap/docs/guides/databases/sqlite
- Domain entities, then service projections: https://cap.cloud.sap/docs/guides/services/providing-services
- Compositions for document structure, associations for references: https://cap.cloud.sap/docs/cds/cdl
- Deep read and the difference between composition insert and association insert: https://cap.cloud.sap/docs/guides/services/served-ootb
- OData is the protocol CAP serves for a service definition.

Handlers query and update `sap.sim` with CAP. The project does not depend on the SAP Cloud SDK, because there is no tenant and no service metadata to call. See [ADR 0006](../adr/0006-cap-queries-not-cloud-sdk.md).

How that maps onto this project:

| Artifact | What it is |
| --- | --- |
| `sap.sim` entities | Local CDS that **simulates** the source documents. Names of SAP fields are kept where verified. The namespace is not a delivered SAP view (`I_SupplierInvoice` and similar are real CDS views inside S/4 and are not created here). |
| `invc` entities | Application-owned investigations, evidence, findings, decisions, and the event inbox. |
| `SimulatedS4Service` | Read projections of `sap.sim`, shaped like the OData reads the agent needs. |
| `InvestigationService` | The workbench API. Projections of `invc`, plus the actions a person can approve. |
| Agent tool routes | Read-only operations. They call the simulated services and return a trimmed JSON document. They are project APIs. |

CAP can import a real EDMX (`cds import`). Ticket 003 may import the four EDMX files once they are downloaded from the Hub while signed in. Until then the CDS model contains only the verified field subset, with a comment on every pending field.

## Design assumptions

These are explicit so they are not mistaken for SAP facts.

- Company code `1010`, currency `EUR`, and the fictional supplier Helios Fasteners are demo master data. `1010` appears in SAP's own sample payloads. It is not a claim about a particular tenant.
- A project tolerance decides when a price difference is large enough to refuse release. Real SAP uses tolerance customizing in invoice verification. That customizing is not simulated.
- The subsequent-credit OData property for "this item is a subsequent debit/credit" is unresolved until the EDMX is downloaded. See ADR 0003 and ticket 007.
- The release action's OData name is unresolved in the same way.
- No payment run, no clearing document, and no Finance-only payment block release are in scope. Releasing a block here means the logistics release operation only.
