using InvestigationService from '../../srv/workbench';

annotate InvestigationService.Investigations with @(
  Capabilities.InsertRestrictions: { Insertable: false },
  Capabilities.UpdateRestrictions: { Updatable: false },
  Capabilities.DeleteRestrictions: { Deletable: false },
  UI.SelectionPresentationVariant: {
    Text: '{i18n>pending}',
    SelectionVariant: {
      SelectOptions: [{
        PropertyName: status,
        Ranges: [
          { Sign: #I, Option: #EQ, Low: 'awaiting_review' },
          { Sign: #I, Option: #EQ, Low: 'open' },
          { Sign: #I, Option: #EQ, Low: 'investigating' },
          { Sign: #I, Option: #EQ, Low: 'investigation_failed' },
        ],
      }],
    },
    PresentationVariant: {
      Visualizations: ['@UI.LineItem'],
    },
  },
  UI.SelectionPresentationVariant #History: {
    Text: '{i18n>processed}',
    SelectionVariant: {
      SelectOptions: [{
        PropertyName: status,
        Ranges: [
          { Sign: #I, Option: #EQ, Low: 'closed' },
        ],
      }],
    },
    PresentationVariant: {
      SortOrder: [{ Property: closedAt, Descending: true }],
      Visualizations: ['@UI.LineItem#History'],
    },
  },
  UI.HeaderInfo: {
    TypeName: '{i18n>investigation}',
    TypeNamePlural: '{i18n>investigations}',
    Title: { Value: supplierInvoice },
    Description: { Value: supplierName },
  },
  UI.SelectionFields: [ status ],
  UI.LineItem: [
    { Value: supplierName, Label: '{i18n>supplier}' },
    { Value: supplierInvoiceIdByInvoicingParty, Label: '{i18n>supplierInvoiceReference}' },
    { Value: invoiceGrossAmount, Label: '{i18n>grossAmount}' },
    { Value: documentCurrency, Label: '{i18n>currency}' },
    { Value: paymentBlockingReason, Label: '{i18n>paymentBlockReason}' },
    { Value: blockCategory, Label: '{i18n>blockCategory}' },
    { Value: status, Label: '{i18n>status}' },
  ],
  UI.LineItem #History: [
    { Value: supplierName, Label: '{i18n>supplier}' },
    { Value: supplierInvoiceIdByInvoicingParty, Label: '{i18n>supplierInvoiceReference}' },
    { Value: invoiceGrossAmount, Label: '{i18n>grossAmount}' },
    { Value: documentCurrency, Label: '{i18n>currency}' },
    { Value: outcome, Label: '{i18n>outcome}' },
    { Value: closedAt, Label: '{i18n>closed}' },
  ],
  UI.FieldGroup #Header: {
    Label: '{i18n>invoiceHeader}',
    Data: [
      { Value: supplierInvoice, Label: '{i18n>supplierInvoice}' },
      { Value: fiscalYear, Label: '{i18n>fiscalYear}' },
      { Value: supplierName, Label: '{i18n>supplier}' },
      { Value: supplierInvoiceIdByInvoicingParty, Label: '{i18n>supplierInvoiceReference}' },
      { Value: invoiceGrossAmount, Label: '{i18n>grossAmount}' },
      { Value: documentCurrency, Label: '{i18n>currency}' },
      { Value: paymentBlockingReason, Label: '{i18n>paymentBlockReason}' },
      { Value: blockCategory, Label: '{i18n>blockCategory}' },
      { Value: status, Label: '{i18n>status}' },
      { Value: recommendedAction, Label: '{i18n>recommendation}' },
    ],
  },
  UI.FieldGroup #Variance: {
    Label: '{i18n>variance}',
    Data: [
      { Value: priceDifference, Label: '{i18n>priceDifference}' },
      { Value: quantityDifference, Label: '{i18n>quantityDifference}' },
      { Value: projectTolerance, Label: '{i18n>tolerance}' },
      { Value: narrative, Label: '{i18n>narrative}' },
    ],
  },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: '{i18n>invoiceHeader}', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: '{i18n>variance}', Target: '@UI.FieldGroup#Variance' },
    { $Type: 'UI.ReferenceFacet', Label: '{i18n>poItems}', Target: 'poItems/@UI.LineItem' },
  ],
);

annotate InvestigationService.Investigations with {
  invoiceGrossAmount @Measures.ISOCurrency: documentCurrency;
  priceDifference @Measures.ISOCurrency: documentCurrency;
};

annotate InvestigationService.SupplierInvoicePoItems with @(
  UI.LineItem: [
    { Value: PurchaseOrder, Label: '{i18n>purchaseOrder}' },
    { Value: PurchaseOrderItem, Label: '{i18n>purchaseOrderItem}' },
    { Value: SupplierInvoiceItemAmount, Label: '{i18n>supplierInvoiceItemAmount}' },
    { Value: QuantityInPurchaseOrderUnit, Label: '{i18n>quantity}' },
    { Value: PurchaseOrderQuantityUnit, Label: '{i18n>unit}' },
  ],
);
