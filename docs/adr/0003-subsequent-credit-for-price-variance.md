---
status: accepted
---

# Post a subsequent credit for a price difference

A posted supplier invoice is not edited in place. When the invoiced quantity matches the goods receipt and the price is too high, SAP logistics invoice verification uses a subsequent credit: a new document that reduces value and leaves quantity unchanged. A plain supplier credit memo is the right document when quantity must change, such as a return, and it is the wrong default for this price-only case.

The original invoice stays as it was. Releasing its payment block is a different action, used when the three-way comparison supports paying the posted amount. The demo does not reverse the invoice and does not pay it.
