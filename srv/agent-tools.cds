service AgentToolService @(path: '/agent-tools') {
  function getSupplierInvoice(SupplierInvoice: String, FiscalYear: String) returns String;
  function getPurchaseOrder(PurchaseOrder: String) returns String;
  function getGoodsReceipts(PurchaseOrder: String, PurchaseOrderItem: String) returns String;
  function getSupplierInvoiceHistory(InvoicingParty: String) returns String;
  function getSupplierBusinessPartner(Supplier: String) returns String;
  function calculateInvoiceVariance(SupplierInvoice: String, FiscalYear: String) returns String;
  function sendEmail(To: String, Body: String, Confirmed: String) returns String;
}
