using InvestigationService from '../../srv/workbench';

annotate InvestigationService.Investigations with @(
  Capabilities.InsertRestrictions: { Insertable: false },
  Capabilities.UpdateRestrictions: { Updatable: false },
  Capabilities.DeleteRestrictions: { Deletable: false },
  UI.SelectionPresentationVariant: {
    Text: 'Pending',
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
  UI.HeaderInfo: {
    TypeName: 'Investigation',
    TypeNamePlural: 'Pending investigations',
    Title: { Value: supplierInvoice },
    Description: { Value: supplierName },
  },
  UI.SelectionFields: [ status ],
  UI.LineItem: [
    { Value: supplierName, Label: 'Supplier' },
    { Value: supplierInvoiceIdByInvoicingParty, Label: 'Supplier invoice reference' },
    { Value: invoiceGrossAmount, Label: 'Gross amount' },
    { Value: documentCurrency, Label: 'Currency' },
    { Value: paymentBlockingReason, Label: 'Payment block reason' },
    { Value: blockCategory, Label: 'Calculated block category' },
    { Value: status, Label: 'Status' },
  ],
  UI.FieldGroup #Header: {
    Label: 'Invoice header',
    Data: [
      { Value: supplierInvoice, Label: 'Supplier invoice' },
      { Value: fiscalYear, Label: 'Fiscal year' },
      { Value: supplierName, Label: 'Supplier' },
      { Value: supplierInvoiceIdByInvoicingParty, Label: 'Supplier invoice reference' },
      { Value: invoiceGrossAmount, Label: 'Gross amount' },
      { Value: documentCurrency, Label: 'Currency' },
      { Value: paymentBlockingReason, Label: 'Payment block reason' },
      { Value: blockCategory, Label: 'Calculated block category' },
      { Value: status, Label: 'Status' },
      { Value: recommendedAction, Label: 'Recommendation' },
    ],
  },
  UI.FieldGroup #Variance: {
    Label: 'Variance',
    Data: [
      { Value: priceDifference, Label: 'Price difference' },
      { Value: quantityDifference, Label: 'Quantity difference' },
      { Value: projectTolerance, Label: 'Tolerance' },
      { Value: narrative, Label: 'Narrative' },
    ],
  },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Invoice header', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: 'Variance', Target: '@UI.FieldGroup#Variance' },
    { $Type: 'UI.ReferenceFacet', Label: 'PO reference items', Target: 'poItems/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Facts', Target: 'factFindings/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Assumptions', Target: 'assumptionFindings/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Missing', Target: 'missingFindings/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Evidence', Target: 'evidence/@UI.LineItem' },
  ],
);

annotate InvestigationService.Investigations with {
  invoiceGrossAmount @Measures.ISOCurrency: documentCurrency;
  priceDifference @Measures.ISOCurrency: documentCurrency;
};

annotate InvestigationService.Investigations:poItems with @(
  UI.LineItem: [
    { Value: PurchaseOrder, Label: 'Purchase order' },
    { Value: PurchaseOrderItem, Label: 'Purchase order item' },
    { Value: SupplierInvoiceItemAmount, Label: 'Supplier invoice item amount' },
    { Value: QuantityInPurchaseOrderUnit, Label: 'Quantity' },
    { Value: PurchaseOrderQuantityUnit, Label: 'Unit' },
  ],
);

annotate InvestigationService.Investigations:factFindings with @(
  UI.LineItem: [
    { Value: text, Label: 'Fact' },
  ],
);

annotate InvestigationService.Investigations:assumptionFindings with @(
  UI.LineItem: [
    { Value: text, Label: 'Assumption' },
  ],
);

annotate InvestigationService.Investigations:missingFindings with @(
  UI.LineItem: [
    { Value: text, Label: 'Missing or error' },
  ],
);

annotate InvestigationService.Investigations:evidence with @(
  UI.LineItem: [
    { Value: api, Label: 'API' },
    { Value: entity, Label: 'Entity' },
    { Value: field, Label: 'Field' },
    { Value: value, Label: 'Value' },
  ],
);
