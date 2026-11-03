import cds from "@sap/cds";

type AdvisorFile = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  tolerance?: number | string;
};

export type AdvisorSettings = {
  apiKey: string;
  model: string;
  baseUrl: string;
  tolerance: number;
};

export function advisorSettings(): AdvisorSettings {
  const file = ((cds.env as { invoiceAdvisor?: AdvisorFile }).invoiceAdvisor ?? {}) as AdvisorFile;
  const tolerance = Number(live("CDS_invoiceAdvisor_tolerance") ?? file.tolerance ?? 0.5);
  return {
    apiKey: text(live("CDS_invoiceAdvisor_apiKey"), file.apiKey, ""),
    model: text(live("CDS_invoiceAdvisor_model"), file.model, "gpt-4o-mini"),
    baseUrl: text(live("CDS_invoiceAdvisor_baseUrl"), file.baseUrl, "https://api.openai.com/v1"),
    tolerance: Number.isFinite(tolerance) ? tolerance : 0.5,
  };
}

function live(name: string): string | undefined {
  return process.env[name];
}

function text(override: string | undefined, configured: unknown, fallback: string): string {
  if (override != null) return override.trim();
  if (typeof configured === "string") return configured.trim() || fallback;
  return fallback;
}
