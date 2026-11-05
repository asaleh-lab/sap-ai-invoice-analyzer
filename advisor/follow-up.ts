import { ChatOpenAI } from "@langchain/openai";
import { advisorSettings } from "./config.ts";
import { allowedActions } from "./policy.ts";
import type { InvestigateTools, ToolArgs } from "./investigate.ts";

const actions = ["post_subsequent_credit", "release_payment_block", "contact_supplier", "dismiss", "insufficient_evidence"];

export type FollowUpFacts = {
  supplierName: string;
  supplierInvoice: string;
  fiscalYear: string;
  purchaseOrder: string;
  purchaseOrderItem: string;
  history: Array<{ SupplierInvoice?: string; PaymentBlockingReason?: string }>;
  material: string;
  materialName: string;
  essential: boolean;
  priceDifference: number;
  quantityDifference: number;
  comparable: boolean;
  tolerance: number;
  currentAction: string;
  supplierEmail: string;
  contactName: string;
  reviewerName: string;
};

export type EmailDraft = { to: string; body: string };

export async function answerFollowUp(
  question: string,
  facts: FollowUpFacts,
  tools: InvestigateTools,
): Promise<{ reply: string; recommendedAction: string; email: EmailDraft | null }> {
  const grounded = scriptedReply(question, facts);
  const settings = advisorSettings();
  if (!settings.apiKey) {
    return {
      reply: "A model key is required.",
      recommendedAction: facts.currentAction,
      email: null,
    };
  }
  try {
    const model = new ChatOpenAI({
      apiKey: settings.apiKey,
      model: settings.model,
      timeout: 60_000,
      configuration: { baseURL: settings.baseUrl },
    });
    const called = await readBundle(tools, facts);
    const response = await model.invoke(
        "Answer only the question. Do not add materials, amounts, or payment blocks unless the question asks for them. " +
        "The supplier name is businessPartner.BusinessPartnerName. " +
        "The supplier contact is businessPartner.contact.ContactName at businessPartner.contact.EmailAddress. " +
        "The reviewer writing the email is " +
        facts.reviewerName +
        ". Sign the email with that name and greet the contact by name. " +
        "Case, all of it is available if the reviewer asks: supplier invoice " +
        facts.supplierInvoice +
        ", fiscal year " +
        facts.fiscalYear +
        ", purchase order " +
        facts.purchaseOrder +
        " item " +
        facts.purchaseOrderItem +
        ", price difference " +
        facts.priceDifference +
        ", quantity difference " +
        facts.quantityDifference +
        ". Mention a fact only when it answers the question or explains the discrepancy. " +
        "Leave out the fiscal year when it is the current year, and leave out a difference of zero, unless the reviewer asks for that figure. " +
        "Reply with one JSON object {\"reply\":\"...\",\"recommendedAction\":\"\",\"email\":null}. " +
        "Set email to {\"to\":\"" +
        facts.supplierEmail +
        "\",\"body\":\"...\"} only when the reviewer asks to email the supplier. Do not say the email was sent. " +
        "recommendedAction is empty, or one of " +
        actions.join(", ") +
        ".\nQuestion: " +
        question +
        "\nTools: " +
        JSON.stringify(called),
    );
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const parsed = parseJson(content);
    const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) return grounded;
    const proposed = typeof parsed?.recommendedAction === "string" ? parsed.recommendedAction : "";
    const decided = applyProposal(facts, reply, proposed, grounded.recommendedAction);
    return { ...decided, email: emailDraft(parsed?.email, facts.supplierEmail) };
  } catch {
    return grounded;
  }
}

export function scriptedReply(question: string, facts: FollowUpFacts): { reply: string; recommendedAction: string; email: EmailDraft | null } {
  const blocked = facts.history.filter((row) => (row.PaymentBlockingReason ?? "") !== "").length;
  const clear = facts.history.length - blocked;
  const essential = facts.essential
    ? `${facts.materialName} (${facts.material}) is marked as an essential material.`
    : `${facts.materialName} (${facts.material}) is not marked as an essential material.`;
  const discipline = `${facts.supplierName} has ${facts.history.length} invoices in the simulated history. ${blocked} are payment-blocked and ${clear} are clear.`;
  const proposed = proposedAction(question);
  const allowed = allowedActions(
    {
      comparable: facts.comparable,
      priceDifference: facts.priceDifference,
      quantityDifference: facts.quantityDifference,
    },
    facts.tolerance,
  );
  const email = /email|e-mail/i.test(question) && facts.supplierEmail
    ? {
        to: facts.supplierEmail,
        body: `Dear ${facts.contactName},\n\nPlease correct supplier invoice ${facts.supplierInvoice} so it matches purchase order ${facts.purchaseOrder}. ${emailFacts(facts, question)}.\n\n${facts.reviewerName}`,
      }
    : null;
  if (email) {
    return {
      reply: `I can email ${facts.contactName} at ${facts.supplierName} (${email.to}). The message is signed ${facts.reviewerName}. Confirm to send it.`,
      recommendedAction: facts.currentAction,
      email,
    };
  }
  if (proposed && !allowed.includes(proposed)) {
    return {
      reply: `${discipline} ${essential} Recommendation ${proposed} was refused. The stored recommendation stays ${facts.currentAction}.`,
      recommendedAction: facts.currentAction,
      email: null,
    };
  }
  const action = proposed && allowed.includes(proposed) ? proposed : facts.currentAction;
  const actionSentence =
    action === facts.currentAction
      ? `The stored recommendation stays ${action}.`
      : `The stored recommendation is now ${action}. Nothing was posted.`;
  return {
    reply: `${discipline} ${essential} ${actionSentence}`,
    recommendedAction: action,
    email: null,
  };
}

function emailFacts(facts: FollowUpFacts, question: string): string {
  const parts = [`supplier invoice ${facts.supplierInvoice}`, `purchase order ${facts.purchaseOrder}`];
  if (facts.purchaseOrderItem) parts.push(`item ${facts.purchaseOrderItem}`);
  const asksYear = /year/i.test(question);
  const asksQuantity = /quantity/i.test(question);
  if (asksYear || facts.fiscalYear !== String(new Date().getFullYear())) parts.push(`fiscal year ${facts.fiscalYear}`);
  if (facts.priceDifference !== 0) parts.push(`price difference ${facts.priceDifference}`);
  if (asksQuantity || facts.quantityDifference !== 0) parts.push(`quantity difference ${facts.quantityDifference}`);
  return parts.join(", ");
}

function emailDraft(value: unknown, supplierEmail: string): EmailDraft | null {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const to = row ? text(row.to) : "";
  const body = row ? text(row.body).trim() : "";
  if (!supplierEmail || to !== supplierEmail || body === "") return null;
  return { to, body: body.slice(0, 4000) };
}

function proposedAction(question: string): string {
  const match = question.match(/recommend\s+([a-z_]+)/i);
  const name = match?.[1] ?? "";
  return actions.includes(name) ? name : "";
}

function applyProposal(
  facts: FollowUpFacts,
  reply: string,
  proposed: string,
  fallbackAction: string,
): { reply: string; recommendedAction: string } {
  if (!proposed) return { reply, recommendedAction: fallbackAction };
  const allowed = allowedActions(
    {
      comparable: facts.comparable,
      priceDifference: facts.priceDifference,
      quantityDifference: facts.quantityDifference,
    },
    facts.tolerance,
  );
  if (!allowed.includes(proposed)) {
    return {
      reply: `${reply} Recommendation ${proposed} was refused. The stored recommendation stays ${facts.currentAction}.`,
      recommendedAction: facts.currentAction,
    };
  }
  return { reply, recommendedAction: proposed };
}

async function readBundle(tools: InvestigateTools, facts: FollowUpFacts): Promise<Record<string, unknown>> {
  const invoice = await tools.get_supplier_invoice({ SupplierInvoice: facts.supplierInvoice, FiscalYear: "2026" });
  const record = asRecord(invoice);
  const party = text(record?.InvoicingParty);
  const item = list(record?.to_SuplrInvcItemPurOrdRef)[0];
  const history = party ? await tools.get_supplier_invoice_history({ InvoicingParty: party }) : [];
  const order = item ? await tools.get_purchase_order({ PurchaseOrder: text(item.PurchaseOrder) }) : null;
  const businessPartner = party ? await tools.get_supplier_business_partner({ Supplier: party }) : null;
  return { invoice, history, order, businessPartner };
}

function parseJson(content: string): Record<string, unknown> | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") as Array<Record<string, unknown>> : [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export type { ToolArgs };
