# SAP reference

Retrieved 2 November 2026 from the signed-in Business Accelerator Hub catalog and from `$metadata` on `sandbox.api.sap.com`. The local copies are in [metadata/](../../metadata/). The running demo does not call that sandbox.

The target product is **SAP S/4HANA Cloud Public Edition**. The Business Accelerator Hub catalog for package `SAPS4HANACloud` lists the APIs below as inbound OData services. Versions are the catalog versions returned on that date.

Facts taken from the signed-in catalog or from the sandbox `$metadata` are marked **Hub catalog** or **sandbox `$metadata`**. Facts taken from SAP Help or an SAP Knowledge Base Article are marked **SAP Help / KBA**. Anything else is marked so it is not treated as the contract.

## Deployment choice

**SAP S/4HANA Cloud Public Edition.** Released APIs, communication scenarios, and the same OData paths a side-by-side extension would call. One communication-arrangement model covers the invoice, the purchase order, the material document, and the business partner.

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
- The sandbox `$metadata` for catalog version 1.6.0 names the operation `Release`. It is a function import, HTTP POST, with `SupplierInvoice`, `FiscalYear`, and `DiscountDaysHaveToBeShifted` (Boolean). The demo sends `DiscountDaysHaveToBeShifted` false. See [metadata/API_SUPPLIERINVOICE_PROCESS_SRV.edmx](../../metadata/API_SUPPLIERINVOICE_PROCESS_SRV.edmx).
- The same file has entity set `A_SupplierInvoiceBlock`. Its reason field is still `PaymentBlockingReason`, one character, label "Log. payment block". That entity is a logistics payment-block list. It is not an item blocking-reason code such as `SPGRQ`. The demo keeps the reason on the invoice header.

Create for a subsequent credit uses the same create operation as any supplier invoice. KBA 2647639: the create payload must be a single entity. Header field `SupplierInvoiceIsCreditMemo` is `Edm.String` length 1. The item field on `A_SuplrInvcItemPurOrdRef` is `IsSubsequentDebitCredit`, also `Edm.String` length 1, label "Subseq. Debit/Credit". The schema does not publish a code list. The demo writes `X` when the indicator is set and leaves it empty when it is not. Do not send the RAP name `suplrinvcissubsqntdebitcrdt`.

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

The sandbox `$metadata` confirms header `A_PurchaseOrderType` (`Supplier`, `CompanyCode`, `DocumentCurrency`) and item `A_PurchaseOrderItemType`. Item fields used here: `OrderQuantity` decimal 13.3, `PurchaseOrderQuantityUnit` string 3, `NetPriceAmount` decimal 12.3, `NetPriceQuantity` decimal 5.0, `Material` string 40. Navigation from the header is `to_PurchaseOrderItem`. KBA 3218443 names the item entity. KBA 2928975 names `PurchaseOrderQuantityUnit`. There is a newer OData V4 purchase order API (`api_purchaseorder_2`). This demo standardizes on the V2 service above so the stack matches the supplier invoice V2 service. See [metadata/API_PURCHASEORDER_PROCESS_SRV.edmx](../../metadata/API_PURCHASEORDER_PROCESS_SRV.edmx).

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

Catalog text: read and create material documents, including a goods receipt for a purchase order, and cancel a document or an item. The sandbox `$metadata` confirms header `A_MaterialDocumentHeader` keyed by `MaterialDocumentYear` and `MaterialDocument`, navigation `to_MaterialDocumentItem`, and item fields `GoodsMovementType`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsMovementRefDocType`, `QuantityInEntryUnit`, `EntryUnit`, `Material`, and `Plant`. See [metadata/API_MATERIAL_DOCUMENT_SRV.edmx](../../metadata/API_MATERIAL_DOCUMENT_SRV.edmx).

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

- `A_AddressEmailAddress` is keyed by `AddressID`, `Person`, and `OrdinalNumber`, and carries `EmailAddress` (string 241). `BusinessPartnerName` is string 81. That shape is in the sandbox `$metadata` for catalog version 1.7.0. See [metadata/API_BUSINESS_PARTNER.edmx](../../metadata/API_BUSINESS_PARTNER.edmx).
- `A_BusinessPartnerContact` is keyed by `RelationshipNumber`, `BusinessPartnerCompany`, `BusinessPartnerPerson`, and `ValidityEndDate`, with navigation `to_ContactAddress`.
- KBA 3392200: navigation `to_ContactAddress` on the contact supports read, and workplace address cannot be created through this API. The demo only reads email.

The supplier master also has its own purchasing block (`purchasingIsBlocked` on `A_Supplier` in the Cloud SDK). That is a master-data block, separate from an invoice payment block.

## Business objects and the fields this demo is allowed to show

Only fields cited above may be presented as SAP fields. Calculated block categories, tolerances, and investigation data are project fields.

| Object | Identity | Fields used as SAP fields |
| --- | --- | --- |
| Supplier invoice header | `SupplierInvoice`, `FiscalYear` | `CompanyCode`, `DocumentDate`, `PostingDate`, `InvoicingParty`, `DocumentCurrency`, `InvoiceGrossAmount`, `PaymentBlockingReason`, `SupplierInvoiceStatus`, `SupplierInvoiceIDByInvcgParty`, `SupplierInvoiceIsCreditMemo`, `TaxIsCalculatedAutomatically` |
| Supplier invoice PO item | `SupplierInvoice`, `FiscalYear`, `SupplierInvoiceItem` | `PurchaseOrder`, `PurchaseOrderItem`, `Plant`, `DocumentCurrency`, `SupplierInvoiceItemAmount`, `QuantityInPurchaseOrderUnit`, `PurchaseOrderQuantityUnit`, `ReferenceDocument`, `ReferenceDocumentFiscalYear`, `ReferenceDocumentItem`, `IsSubsequentDebitCredit` |
| Purchase order header | `PurchaseOrder` | `Supplier`, `CompanyCode`, `DocumentCurrency` |
| Purchase order item | `PurchaseOrder` + `PurchaseOrderItem` | `OrderQuantity`, `PurchaseOrderQuantityUnit`, `NetPriceAmount`, `NetPriceQuantity`, `Material`. Navigation `to_PurchaseOrderItem`. |
| Material document header | `MaterialDocument` + `MaterialDocumentYear` | `PostingDate`, `GoodsMovementCode`, `ReferenceDocument` |
| Material document item | header key + `MaterialDocumentItem` | `GoodsMovementType`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsMovementRefDocType`, `QuantityInEntryUnit`, `EntryUnit`, `Material`, `Plant` |
| Business partner | `BusinessPartner` | `BusinessPartnerName`, `Supplier` |
| Address email | `AddressID`, `Person`, `OrdinalNumber` | `EmailAddress` |
| Contact relationship | `RelationshipNumber`, `BusinessPartnerCompany`, `BusinessPartnerPerson`, `ValidityEndDate` | Navigation `to_ContactAddress`. The demo stores the email row, not the full relationship. |

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

The signed-in catalog has Public Edition package `CE_SUPPLIERINVOICEEVENTS`, version 1.0.0, title Supplier Invoice Events. The specification is [metadata/CE_SUPPLIERINVOICEEVENTS.asyncapi.json](../../metadata/CE_SUPPLIERINVOICEEVENTS.asyncapi.json). It publishes two events:

- `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1` on topic `ce/sap/s4/beh/supplierinvoice/v1/SupplierInvoice/Created/v1`, raised when a supplier invoice has been posted.
- `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Canceled.v1` on topic `ce/sap/s4/beh/supplierinvoice/v1/SupplierInvoice/Canceled/v1`, raised when a supplier invoice has been reversed.

Both payloads carry `SupplierInvoice`, `FiscalYear`, and `SupplierInvoiceFiscalYear`. Neither payload contains a payment block. The on-premise package is `OP_SUPPLIERINVOICEEVENTS`. This demo follows the Public Edition package.

The local publisher sends `SupplierInvoice.Created`. The consumer reads `A_SupplierInvoice`. A non-empty `PaymentBlockingReason` means that supplier invoice is blocked, and the investigation stores that value as the payment block reason. An empty reason means the invoice is not blocked. `SupplierInvoice.Canceled` is a reversal and is not an investigation trigger.

### What is not claimed

- There is no event in that package named Supplier Invoice Blocked or Payment Block Changed.
- The created event does not itself mean the invoice is blocked. The invoice field does.

The demo event is specified in [event-contracts.md](event-contracts.md). Its CloudEvents envelope follows the verified shape. Its `type` is the Hub created type. Its `data` carries the invoice key, and the invoice read supplies the payment block reason.

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

The four service schemas and the supplier invoice event specification are in [metadata/](../../metadata/). They are local files. The app does not call the Hub, the sandbox, or a tenant to read them.

## Design assumptions

These are explicit so they are not mistaken for SAP facts.

- Company code `1010`, currency `EUR`, and the fictional supplier Helios Fasteners are demo master data. `1010` appears in SAP's own sample payloads. It is not a claim about a particular tenant.
- A project tolerance decides when a price difference is large enough to refuse release. Real SAP uses tolerance customizing in invoice verification. That customizing is not simulated.
- `IsSubsequentDebitCredit` and `SupplierInvoiceIsCreditMemo` are one-character indicators. The demo uses `X` for set. The schema does not list the allowed characters.
- Releasing a block calls the local stand-in for function import `Release` and clears `PaymentBlockingReason`. It does not shift cash-discount days.
- No payment run, no clearing document, and no Finance-only payment block release are in scope.
