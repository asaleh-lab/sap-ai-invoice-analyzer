export function outcomeLabels(summary: { released: number; subsequentCreditPosted: number; dismissed: number }): Array<{
  label: string;
  count: number;
}> {
  return [
    { label: "Released", count: summary.released },
    { label: "Invoice reduction posted", count: summary.subsequentCreditPosted },
    { label: "Dismissed", count: summary.dismissed },
  ];
}
