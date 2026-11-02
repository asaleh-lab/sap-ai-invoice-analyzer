using { invc } from '../db/investigation';
using { sap.sim as sim } from '../db/sap-sim';

service InvestigationService @(path: '/workbench') {
  entity Investigations as projection on invc.Investigations {
    *,
    case
      when quantityDifference is null or priceDifference is null then 'unresolved'
      when quantityDifference <> 0 then 'quantity'
      when priceDifference > projectTolerance or priceDifference < -projectTolerance then 'price'
      when quantityDifference = 0 and priceDifference = 0 then 'manual block'
      else 'unresolved'
    end as blockCategory : String(20),
    poItems : Association to many sim.SupplierInvoicePoItems
      on poItems.invoice.SupplierInvoice = supplierInvoice
      and poItems.invoice.FiscalYear = fiscalYear,
    factFindings : Association to many invc.Findings
      on factFindings.investigation = $self and factFindings.kind = 'fact',
    assumptionFindings : Association to many invc.Findings
      on assumptionFindings.investigation = $self and assumptionFindings.kind = 'assumption',
    missingFindings : Association to many invc.Findings
      on missingFindings.investigation = $self and missingFindings.kind = 'missing'
  };
  @readonly entity EventInbox as projection on invc.EventInbox;
  action retryInvestigation(ID: UUID);
}
