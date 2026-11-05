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
      and poItems.invoice.FiscalYear = fiscalYear
  };
  @readonly entity EventInbox as projection on invc.EventInbox;
  action retryInvestigation(ID: UUID);
  action askInvestigation(ID: UUID, question: String) returns ChatReply;
  action confirmSendEmail(ID: UUID) returns ChatReply;

  type ChatReply {
    reply : String(4000);
    recommendedAction : String;
    emailTo : String(241);
    emailBody : String(4000);
    confirmationRequired : Boolean;
  }
  action releasePaymentBlock(investigationId: UUID, actor: String) returns Decision;
  action postSubsequentCredit(investigationId: UUID, actor: String) returns Decision;
  action prepareSupplierContact(investigationId: UUID, actor: String) returns Decision;
  action dismissInvestigation(investigationId: UUID, actor: String, reason: String) returns Decision;
  function workbenchSummary() returns WorkbenchSummary;

  type SupplierPending {
    supplierName : String(81);
    pendingCount : Integer;
    highlighted : Boolean;
  }

  type WorkbenchSummary {
    pending : Integer;
    closed : Integer;
    released : Integer;
    subsequentCreditPosted : Integer;
    dismissed : Integer;
    contactDrafts : Integer;
    suppliers : many SupplierPending;
  }

  type Decision {
    ID : UUID;
    action : String;
    reason : String;
    actor : String;
    simulatedDocument : String;
    simulatedFiscalYear : String;
    emailDraftTo : String;
    emailDraftBody : String;
  }
}
