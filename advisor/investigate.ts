import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { advisorSettings, type AdvisorSettings } from "./config.ts";
import { allowedActions, scriptedAction } from "./policy.ts";

export type ToolArgs = Record<string, string>;

export type InvestigateTools = {
  get_supplier_invoice: (args: ToolArgs) => Promise<unknown>;
  get_purchase_order: (args: ToolArgs) => Promise<unknown>;
  get_goods_receipts: (args: ToolArgs) => Promise<unknown>;
  get_supplier_invoice_history: (args: ToolArgs) => Promise<unknown>;
  get_supplier_business_partner: (args: ToolArgs) => Promise<unknown>;
  calculate_invoice_variance: (args: ToolArgs) => Promise<unknown>;
};

export type InvestigateRequest = {
  caseId: string;
  objective: string;
  input: {
    SupplierInvoice: string;
    FiscalYear: string;
  };
  tools: InvestigateTools;
};

export type Advice = {
  recommendedAction: string;
  narrative: string;
  priceDifference: string;
  quantityDifference: string;
  toolsCalled: string[];
  comparable: boolean;
  priceDifferenceNumber: number;
  quantityDifferenceNumber: number;
};

const requiredFields: Record<keyof InvestigateTools, string[]> = {
  get_supplier_invoice: ["SupplierInvoice", "FiscalYear"],
  get_purchase_order: ["PurchaseOrder"],
  get_goods_receipts: ["PurchaseOrder", "PurchaseOrderItem"],
  get_supplier_invoice_history: ["InvoicingParty"],
  get_supplier_business_partner: ["Supplier"],
  calculate_invoice_variance: ["SupplierInvoice", "FiscalYear"],
};

const Phase = Annotation.Root({
  phase: Annotation<string>({ reducer: (_left, right) => right, default: () => "start" }),
});

export async function investigate(request: InvestigateRequest): Promise<Advice> {
  const settings = advisorSettings();
  if (settings.apiKey === "") return scripted(request, settings.tolerance);
  return modelAdvice(request, settings);
}

async function scripted(request: InvestigateRequest, tolerance: number): Promise<Advice> {
  const called: string[] = [];
  const bag: Record<string, unknown> = {};
  const invoiceKey = request.input;

  const graph = new StateGraph(Phase)
    .addNode("invoice", async () => {
      bag.invoice = await call(request.tools, called, "get_supplier_invoice", invoiceKey);
      return { phase: "invoice" };
    })
    .addNode("references", async () => {
      const invoice = asRecord(bag.invoice);
      const item = firstItem(invoice);
      if (item?.PurchaseOrder && item.PurchaseOrderItem) {
        bag.purchaseOrder = await call(request.tools, called, "get_purchase_order", {
          PurchaseOrder: String(item.PurchaseOrder),
        });
        bag.goodsReceipts = await call(request.tools, called, "get_goods_receipts", {
          PurchaseOrder: String(item.PurchaseOrder),
          PurchaseOrderItem: String(item.PurchaseOrderItem),
        });
      }
      return { phase: "references" };
    })
    .addNode("variance", async () => {
      bag.variance = await call(request.tools, called, "calculate_invoice_variance", invoiceKey);
      return { phase: "variance" };
    })
    .addNode("context", async () => {
      const invoice = asRecord(bag.invoice);
      const party = text(invoice?.InvoicingParty);
      if (party !== "") {
        bag.history = await call(request.tools, called, "get_supplier_invoice_history", { InvoicingParty: party });
        const order = asRecord(bag.purchaseOrder);
        const supplier = text(order?.Supplier) || party;
        bag.partner = await call(request.tools, called, "get_supplier_business_partner", { Supplier: supplier });
      }
      return { phase: "context" };
    })
    .addEdge(START, "invoice")
    .addEdge("invoice", "references")
    .addEdge("references", "variance")
    .addEdge("variance", "context")
    .addEdge("context", END)
    .compile();

  await graph.invoke({ phase: "start" });
  return adviceFromBag(request.input.SupplierInvoice, bag, called, null, tolerance);
}

async function modelAdvice(request: InvestigateRequest, settings: AdvisorSettings): Promise<Advice> {
  const called: string[] = [];
  const bag: Record<string, unknown> = {};
  const model = new ChatOpenAI({
    apiKey: settings.apiKey,
    model: settings.model,
    timeout: 60_000,
    configuration: {
      baseURL: settings.baseUrl,
    },
  });

  const messages: string[] = [
    `${request.objective} Invoice ${request.input.SupplierInvoice} fiscal year ${request.input.FiscalYear}. ` +
      "Reply with one JSON object. Either {\"tool\": \"<name>\", \"args\": {}} or, when the reads are done, " +
      "{\"recommendedAction\": \"post_subsequent_credit|release_payment_block|contact_supplier|dismiss|insufficient_evidence\", \"narrative\": \"...\"}. " +
      "Tools: get_supplier_invoice(SupplierInvoice, FiscalYear), get_purchase_order(PurchaseOrder), get_goods_receipts(PurchaseOrder, PurchaseOrderItem), " +
      "calculate_invoice_variance(SupplierInvoice, FiscalYear), get_supplier_business_partner(Supplier), get_supplier_invoice_history(InvoicingParty). " +
      "Call the invoice and the variance tool. Do not invent amounts.",
  ];
  let narrative = "";
  let recommendedAction = "insufficient_evidence";
  let corrections = 0;

  const graph = new StateGraph(Phase)
    .addNode("model", async () => {
      const response = await model.invoke(messages.join("\n"));
      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      messages.push(content);
      const parsed = parseJson(content);
      if (parsed && typeof parsed.tool === "string") {
        bag.pendingTool = parsed.tool;
        bag.pendingArgs = asRecord(parsed.args) ?? {};
        return { phase: "tool" };
      }
      if (parsed && typeof parsed.recommendedAction === "string") {
        const grounded = called.includes("get_supplier_invoice") && called.includes("calculate_invoice_variance");
        const variance = asRecord(bag.variance);
        const numbers = {
          comparable: variance?.comparable === true,
          priceDifference: number(variance?.priceDifference),
          quantityDifference: number(variance?.quantityDifference),
        };
        const allowed = allowedActions(numbers, settings.tolerance);
        if (!grounded || !allowed.includes(parsed.recommendedAction)) {
          corrections += 1;
          if (corrections > 2) {
            if (!grounded) {
              bag.fallback = true;
              return { phase: "done" };
            }
            recommendedAction = scriptedAction(numbers, settings.tolerance);
            narrative = text(parsed.narrative);
            return { phase: "done" };
          }
          messages.push(
            grounded
              ? `Action ${parsed.recommendedAction} is not allowed for price difference ${numbers.priceDifference} and quantity difference ${numbers.quantityDifference}. Allowed: ${allowed.join(", ")}.`
              : "Call get_supplier_invoice and calculate_invoice_variance before recommending an action.",
          );
          return { phase: "model" };
        }
        recommendedAction = parsed.recommendedAction;
        narrative = text(parsed.narrative);
      }
      return { phase: "done" };
    })
    .addNode("tool", async () => {
      const name = text(bag.pendingTool) as keyof InvestigateTools;
      if (name in requiredFields) {
        const result = await call(request.tools, called, name, recordStrings(asRecord(bag.pendingArgs)));
        bag[name] = result;
        if (name === "get_supplier_invoice") bag.invoice = result;
        if (name === "get_purchase_order") bag.purchaseOrder = result;
        if (name === "get_goods_receipts") bag.goodsReceipts = result;
        if (name === "calculate_invoice_variance") bag.variance = result;
        messages.push(`Tool ${name} returned ${JSON.stringify(result)}`);
      }
      return { phase: "model" };
    })
    .addEdge(START, "model")
    .addConditionalEdges("model", (state) => {
      if (state.phase === "tool") return "tool";
      if (state.phase === "model") return "model";
      return END;
    })
    .addEdge("tool", "model")
    .compile();

  await Promise.race([
    graph.invoke({ phase: "start" }, { recursionLimit: 16 }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("model call timed out")), 60_000);
    }),
  ]);

  if (bag.fallback === true) return scripted(request, settings.tolerance);
  return adviceFromBag(request.input.SupplierInvoice, bag, called, { recommendedAction, narrative }, settings.tolerance);
}

function adviceFromBag(
  supplierInvoice: string,
  bag: Record<string, unknown>,
  called: string[],
  model: { recommendedAction: string; narrative: string } | null,
  tolerance: number,
): Advice {
  const variance = asRecord(bag.variance);
  const price = number(variance?.priceDifference);
  const quantity = number(variance?.quantityDifference);
  const comparable = variance?.comparable === true;
  const action = model?.recommendedAction ?? scriptedAction({ comparable, priceDifference: price, quantityDifference: quantity }, tolerance);
  const priceText = money(price);
  const quantityText = quantityTextOf(quantity);
  const narrative =
    model?.narrative ||
    `Supplier invoice ${supplierInvoice} is blocked. The price difference is ${priceText} and the quantity difference is ${quantityText}. The recommended action is ${action}.`;
  return {
    recommendedAction: action,
    narrative,
    priceDifference: priceText,
    quantityDifference: quantityText,
    comparable,
    priceDifferenceNumber: price,
    quantityDifferenceNumber: quantity,
    toolsCalled: called,
  };
}

async function call(
  tools: InvestigateTools,
  called: string[],
  name: keyof InvestigateTools,
  args: ToolArgs,
): Promise<unknown> {
  for (const field of requiredFields[name]) {
    if (args[field] == null || args[field] === "") throw new Error(`${field} is required.`);
  }
  called.push(name);
  return tools[name](args);
}

function parseJson(content: string): Record<string, unknown> | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function items(invoice: Record<string, unknown> | null): Record<string, unknown>[] {
  return itemsOf(invoice, "to_SuplrInvcItemPurOrdRef");
}

function firstItem(invoice: Record<string, unknown> | null): Record<string, unknown> | null {
  return items(invoice)[0] ?? null;
}

function itemsOf(row: Record<string, unknown> | null, field: string): Record<string, unknown>[] {
  const value = row?.[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => item != null && typeof item === "object");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordStrings(value: Record<string, unknown> | null): ToolArgs {
  const args: ToolArgs = {};
  if (!value) return args;
  for (const [key, entry] of Object.entries(value)) args[key] = text(entry);
  return args;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function quantityTextOf(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}
