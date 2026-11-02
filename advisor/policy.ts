export type VarianceNumbers = {
  comparable: boolean;
  priceDifference: number;
  quantityDifference: number;
};

const otherActions = ["contact_supplier", "dismiss", "insufficient_evidence"] as const;

export function allowedActions(variance: VarianceNumbers, tolerance: number): string[] {
  const quantity = variance.quantityDifference > 0 ? variance.quantityDifference : 0;
  if (!variance.comparable || quantity > 0) return [...otherActions];
  const actions: string[] = [];
  if (variance.priceDifference > tolerance) actions.push("post_subsequent_credit");
  if (Math.abs(variance.priceDifference) <= tolerance) actions.push("release_payment_block");
  actions.push(...otherActions);
  return actions;
}

export function scriptedAction(variance: VarianceNumbers, tolerance: number): string {
  const allowed = allowedActions(variance, tolerance);
  if (allowed.includes("post_subsequent_credit")) return "post_subsequent_credit";
  if (allowed.includes("release_payment_block")) return "release_payment_block";
  return "contact_supplier";
}
