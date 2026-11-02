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
