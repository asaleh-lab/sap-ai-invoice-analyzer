import cds from "@sap/cds";

type Row = Record<string, unknown>;

type Sql = {
  SELECT: {
    from(entity: string): Promise<Row[]>;
  };
};

const pendingStatuses = new Set(["awaiting_review", "open", "investigating", "investigation_failed", "action_in_progress"]);

const runtime = cds as unknown as {
  services: Record<string, { on(event: string, handler: () => Promise<Record<string, unknown>>): void }>;
  on(event: "served", handler: () => void): void;
  ql: Sql;
};

const { SELECT } = runtime.ql;

export function registerWorkbenchSummary(): void {
  runtime.on("served", () => {
    const service = runtime.services.InvestigationService;
    if (!service) return;
    service.on("workbenchSummary", summarize);
  });
}

async function summarize(): Promise<Record<string, unknown>> {
  const investigations = await SELECT.from("invc.Investigations");
  const decisions = await SELECT.from("invc.Decisions");
  let pending = 0;
  let closed = 0;
  let released = 0;
  let subsequentCreditPosted = 0;
  let dismissed = 0;
  const bySupplier = new Map<string, number>();
  for (const row of investigations) {
    const status = String(row.status ?? "");
    if (pendingStatuses.has(status)) {
      pending += 1;
      const name = String(row.supplierName ?? "");
      bySupplier.set(name, (bySupplier.get(name) ?? 0) + 1);
    }
    if (status === "closed") {
      closed += 1;
      const outcome = String(row.outcome ?? "");
      if (outcome === "release_payment_block") released += 1;
      if (outcome === "post_subsequent_credit") subsequentCreditPosted += 1;
      if (outcome === "dismiss") dismissed += 1;
    }
  }
  const highest = Math.max(0, ...bySupplier.values());
  const suppliers = [...bySupplier.entries()].map(([supplierName, pendingCount]) => ({
    supplierName,
    pendingCount,
    highlighted: pendingCount === highest && highest > 0,
  }));
  const contactDrafts = decisions.filter((row) => String(row.action ?? "") === "contact_supplier").length;
  return { pending, closed, released, subsequentCreditPosted, dismissed, contactDrafts, suppliers };
}
