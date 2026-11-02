export type InvestigateRequest = {
  caseId: string;
  objective: string;
  input: {
    SupplierInvoice: string;
    FiscalYear: string;
  };
  tools: object;
};

export function investigate(_request: InvestigateRequest): Promise<never> {
  return Promise.reject(new Error("Not implemented"));
}
