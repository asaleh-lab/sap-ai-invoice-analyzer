using { invc } from '../db/investigation';

service InvestigationService @(path: '/workbench') {
  entity Investigations as projection on invc.Investigations;
  @readonly entity EventInbox as projection on invc.EventInbox;
  action retryInvestigation(ID: UUID);
}
