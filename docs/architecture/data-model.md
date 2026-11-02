# Data model

Two CDS namespaces. `sap.sim` holds simulated S/4HANA Cloud documents. `invc` holds the workbench. Nothing in `invc` is an SAP business object. Nothing in `sap.sim` is delivered SAP content. Field names inside `sap.sim` follow [sap-reference.md](sap-reference.md).

CAP serves both through projections. Compositions are used where the child cannot exist without the parent. Associations are used where the target is an independent document.

## `sap.sim` simulated source documents

```cds
namespace sap.sim;

entity SupplierInvoices {
  key SupplierInvoice : String(10);
  key FiscalYear      : String(4);
  CompanyCode         : String(4);
  DocumentDate        : Date;
  PostingDate         : Date;
  InvoicingParty      : String(10);
  SupplierInvoiceIDByInvcgParty : String(16);
  DocumentCurrency    : String(5);
  InvoiceGrossAmount  : Decimal(14, 3);
  PaymentBlockingReason : String(1);
  SupplierInvoiceStatus : String(1);
  SupplierInvoiceIsCreditMemo : String(1);
  TaxIsCalculatedAutomatically : Boolean;
  items : Composition of many SupplierInvoicePoItems on items.invoice = $self;
}

entity SupplierInvoicePoItems {
  key invoice             : Association to SupplierInvoices;
  key SupplierInvoiceItem : String(6);
  PurchaseOrder           : String(10);
  PurchaseOrderItem       : String(5);
  Plant                   : String(4);
  DocumentCurrency        : String(5);
  SupplierInvoiceItemAmount : Decimal(14, 3);
  QuantityInPurchaseOrderUnit : Decimal(13, 3);
  PurchaseOrderQuantityUnit : String(3);
  ReferenceDocument       : String(10);
  ReferenceDocumentFiscalYear : String(4);
  ReferenceDocumentItem   : String(4);
  // A_SuplrInvcItemPurOrdRef.IsSubsequentDebitCredit, Edm.String length 1.
  // Empty when the item is not a subsequent debit or credit. The demo writes X when it is.
  IsSubsequentDebitCredit : String(1);
}

entity PurchaseOrders {
  key PurchaseOrder : String(10);
  Supplier          : String(10);
  CompanyCode       : String(4);
  DocumentCurrency  : String(5);
  items : Composition of many PurchaseOrderItems on items.header = $self;
}

entity PurchaseOrderItems {
  key header : Association to PurchaseOrders;
  key PurchaseOrderItem : String(5);
  Material : String(40);
  OrderQuantity : Decimal(13, 3);
  PurchaseOrderQuantityUnit : String(3);
  NetPriceAmount : Decimal(12, 3);
  NetPriceQuantity : Decimal(5, 0);
}

entity MaterialDocuments {
  key MaterialDocument     : String(10);
  key MaterialDocumentYear : String(4);
  PostingDate              : Date;
  GoodsMovementCode        : String(2);
  ReferenceDocument        : String(16);
  items : Composition of many MaterialDocumentItems on items.header = $self;
}

entity MaterialDocumentItems {
  key header : Association to MaterialDocuments;
  key MaterialDocumentItem : String(4);
  GoodsMovementType : String(3);
  GoodsMovementRefDocType : String(1);
  PurchaseOrder : String(10);
  PurchaseOrderItem : String(5);
  QuantityInEntryUnit : Decimal(13, 3);
  EntryUnit : String(3);
  Material : String(40);
  Plant : String(4);
}

entity BusinessPartners {
  key BusinessPartner : String(10);
  BusinessPartnerName : String(81);
  Supplier : String(10);
  emails : Composition of many BusinessPartnerEmails on emails.partner = $self;
}

entity BusinessPartnerEmails {
  key partner : Association to BusinessPartners;
  key AddressID : String(10);
  key Person : String(10);
  key OrdinalNumber : String(3);
  EmailAddress : String(241);
}
```

`IsSubsequentDebitCredit` is the item field from `A_SuplrInvcItemPurOrdRef` in [the supplier invoice schema](../../metadata/API_SUPPLIERINVOICE_PROCESS_SRV.edmx). The investigation write path is the only writer of supplier invoices after seed load. `BusinessPartnerEmails` keeps the key of `A_AddressEmailAddress`: `AddressID`, `Person`, `OrdinalNumber`. It is not the full business partner service.

There is no foreign-key association from the invoice item to the purchase order in `sap.sim`. The relationship is the documented reference fields, looked up by value, because that is how the OData documents point at each other.

## `invc` application-owned entities

```cds
namespace invc;

type InboxStatus : String enum {
  received;
  processed;
  duplicate;
  duplicate_open_case;
  rejected;
  invalid;
  failed;
}

type InvestigationStatus : String enum {
  open;
  investigating;
  awaiting_review;
  investigation_failed;
  action_in_progress;
  closed;
}

type RecommendedAction : String enum {
  release_payment_block;
  post_subsequent_credit;
  contact_supplier;
  dismiss;
  insufficient_evidence;
}

type FindingKind : String enum { fact; assumption; missing; }

entity EventInbox {
  key id            : String(64);
  source            : String(128);
  type              : String(128);
  time              : Timestamp;
  subject           : String(32);
  supplierInvoice   : String(10);
  fiscalYear        : String(4);
  status            : InboxStatus;
  attemptCount      : Integer default 0;
  errorMessage      : String(500);
  investigation     : Association to Investigations;
  receivedAt        : Timestamp;
}

entity Investigations {
  key ID : UUID;
  supplierInvoice : String(10);
  fiscalYear      : String(4);
  invoicingParty  : String(10);
  supplierName : String(81);
  supplierInvoiceIdByInvoicingParty : String(16);
  documentCurrency : String(5);
  invoiceGrossAmount : Decimal(13, 2);
  paymentBlockingReason : String(1);
  status : InvestigationStatus;
  recommendedAction : RecommendedAction;
  narrative : String(2000);
  priceDifference : Decimal(13, 2);
  quantityDifference : Decimal(13, 3);
  projectTolerance : Decimal(13, 2);
  outcome : RecommendedAction;
  closedAt : Timestamp;
  findings : Composition of many Findings on findings.investigation = $self;
  evidence : Composition of many Evidence on evidence.investigation = $self;
  decisions : Composition of many Decisions on decisions.investigation = $self;
  events : Association to many EventInbox on events.investigation = $self;
}

entity Findings {
  key ID : UUID;
  investigation : Association to Investigations;
  kind : FindingKind;
  text : String(1000);
  sortOrder : Integer;
}

entity Evidence {
  key ID : UUID;
  investigation : Association to Investigations;
  api : String(80);
  entity : String(80);
  objectKey : String(40);
  field : String(80);
  value : String(120);
}

entity Decisions {
  key ID : UUID;
  investigation : Association to Investigations;
  action : RecommendedAction;
  reason : String(1000);
  actor : String(80);
  decidedAt : Timestamp;
  simulatedDocument : String(20);
  simulatedFiscalYear : String(4);
  emailDraftTo : String(241);
  emailDraftBody : String(4000);
}
```

`Investigations` copies the header facts it shows on the list so the list does not join the simulated invoice on every row. The event consumer copies them from the supplier invoice read when it opens the case, and copies `supplierName` from `BusinessPartnerName` on the invoicing party. The detail view still loads the live simulated invoice so a later write is visible. `blockCategory` is not stored. The workbench projection calculates it from the stored differences: a non-zero quantity difference is `quantity`, an absolute price difference above `projectTolerance` is `price`, both differences zero is `manual block`, and a missing difference is `unresolved`.

One open investigation per supplier invoice and fiscal year. "Open" means status is not `closed`. The consumer checks that before insert. There is no partial unique index. SQLite would need one, and CAP's model does not express it, so the service keeps the rule.

## Status and who may change it

| From | To | Who |
| --- | --- | --- |
| — | `open` | Event consumer, after the invoice read shows a payment block |
| `open` | `investigating` | Agent run starts |
| `investigating` | `awaiting_review` | Recommendation stored and policy checks passed |
| `investigating` | `investigation_failed` | Agent or tool error |
| `investigation_failed` | `investigating` | Retry |
| `awaiting_review` | `action_in_progress` | Approved write started |
| `action_in_progress` | `closed` | Simulated write succeeded, or dismiss succeeded |
| `action_in_progress` | `awaiting_review` | Simulated write rejected, case stays reviewable |
| `awaiting_review` | `awaiting_review` | Contact draft saved. The case stays open. |
| `awaiting_review` | `closed` | Dismiss, with a reason |

`outcome` is set only when the case closes. Contact draft does not set `outcome` and does not clear `PaymentBlockingReason`.

Dismiss writes a `Decisions` row and closes the case. It does not update `sap.sim`.

Release sets `PaymentBlockingReason` to empty on the simulated invoice, writes the decision, and closes the case with outcome `release_payment_block`.

Subsequent credit inserts a new `SupplierInvoices` row with `SupplierInvoiceIsCreditMemo` set to `X`, item quantity equal to the already invoiced quantity, item amount equal to the price difference, and `IsSubsequentDebitCredit` set to `X`. The original invoice is left unchanged, including its payment block. The case closes with outcome `post_subsequent_credit`. The new document number is stored on the decision. Whether the original block should also be released is a separate human action and is out of the MVP. The UI says the original invoice remains blocked until someone releases it.

## Services

```cds
service SimulatedS4Service @(path: '/simulated-s4') {
  @readonly entity SupplierInvoices as projection on sap.sim.SupplierInvoices;
  @readonly entity PurchaseOrders as projection on sap.sim.PurchaseOrders;
  @readonly entity MaterialDocuments as projection on sap.sim.MaterialDocuments;
  @readonly entity BusinessPartners as projection on sap.sim.BusinessPartners;
}

service InvestigationService @(path: '/workbench') {
  entity Investigations as projection on invc.Investigations;
  @readonly entity EventInbox as projection on invc.EventInbox;

  action releasePaymentBlock(investigationId: UUID, actor: String);
  action postSubsequentCredit(investigationId: UUID, actor: String);
  action prepareSupplierContact(investigationId: UUID, actor: String);
  action dismissInvestigation(investigationId: UUID, actor: String, reason: String);
  action retryInvestigation(ID: UUID);
}

service AgentToolService @(path: '/agent-tools') {
  function getSupplierInvoice(SupplierInvoice: String, FiscalYear: String) returns String;
  function getPurchaseOrder(PurchaseOrder: String) returns String;
  function getGoodsReceipts(PurchaseOrder: String, PurchaseOrderItem: String) returns String;
  function getSupplierInvoiceHistory(InvoicingParty: String) returns String;
  function getSupplierBusinessPartner(Supplier: String) returns String;
  function calculateInvoiceVariance(SupplierInvoice: String, FiscalYear: String) returns String;
}
```

`AgentToolService` functions return the JSON documents from [tool-catalog.md](tool-catalog.md). They are functions, so CAP exposes them as reads. `InvestigationService` actions are the only writes.

`SimulatedS4Service` is `@readonly`. Seed CSV files under `db/data` load the starting documents. Runtime inserts into `sap.sim.SupplierInvoices` happen in server code from `postSubsequentCredit`, not through the OData create of the simulated service.

## What is local-only

| Local | SAP document it reflects |
| --- | --- |
| `invc.Investigations` and children | None |
| `invc.EventInbox` | The consumer's copy of a CloudEvent. Event Mesh would not store this table. |
| `sap.sim.*` | The OData entities named in the SAP reference, reduced to the verified fields |
| `IsSubsequentDebitCredit` value `X` | The schema types the indicator as one character and does not publish a code list. `X` means set. Empty means not set. |
| `projectTolerance` | Stand-in for invoice-verification tolerance customizing |
| Block category shown in the UI | Calculated. The SAP field beside it is `PaymentBlockingReason`. |
