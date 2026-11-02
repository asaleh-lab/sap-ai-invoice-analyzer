---
status: accepted
---

# A publisher screen creates the invoice, then posts the created event

People trying the demo should not start from curl, and they should not see only Helios Fasteners. Curl remains the test path for `POST /simulated-events`. The demo path is a separate publisher screen.

The publisher picks one of four templates and fills supplier, amounts, and quantities from that template. It inserts the purchase order, the goods receipt, and the supplier invoice into the simulated documents, then posts `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1`. The CloudEvent still only names the invoice and the fiscal year. The consumer still opens a case only when the saved invoice has a payment block. A second post for an invoice that already has an open case does not open another one.

The four templates are the ones the workbench already knows how to judge:

- Price above the purchase order, quantity matches the goods receipt. Payment block set.
- Quantity above the goods receipt, price matches the purchase order. Payment block set.
- Price and quantity match. Payment block set.
- No payment block. The inbox stores the event and rejects it. No case opens.

Free-typed prices are out. A template that omits the purchase order or the goods receipt is out, because the advisor would report missing documents.

SQLite is seeded with several suppliers, not one. Each supplier has older posted invoices, some blocked and some not, with the purchase orders and goods receipts behind them. That history is what the advisor reads and what a supplier list on the dashboard can rank. Investigations are still not seeded. The inbox still starts empty. Helios Fasteners and invoices `5100001001`, `5100001002`, `5100001003`, and `5100000900` stay, so the scripted walkthrough still has a fixed story.

The workbench remains the reviewer's queue. The publisher does not release a block, post a subsequent credit, or dismiss a case.
