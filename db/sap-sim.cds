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
