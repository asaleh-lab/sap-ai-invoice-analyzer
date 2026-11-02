using { sap.sim as sim } from '../db/sap-sim';

service SimulatedS4Service @(path: '/simulated-s4') {
  @readonly entity SupplierInvoices as projection on sim.SupplierInvoices;
  @readonly entity PurchaseOrders as projection on sim.PurchaseOrders;
  @readonly entity MaterialDocuments as projection on sim.MaterialDocuments;
  @readonly entity BusinessPartners as projection on sim.BusinessPartners;
}
