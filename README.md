# A blocked invoice, looked at properly

We spent two evenings on this. The point was to show how we work when the problem lives inside a business process, not beside it.

A supplier invoice has been posted and then blocked for payment. Someone has to decide what that block means. The purchase order said one price. The goods receipt said what actually arrived. The invoice said something else. Paying it, asking the supplier for a credit, or leaving it alone are different business acts, and they are not interchangeable.

## How we approached it

In a real project we start with what the system already does. SAP S/4HANA Cloud already knows supplier invoices, purchase orders, goods receipts, payment blocks, and the release of a blocked invoice. It already publishes APIs for those objects, and it already sends business events through Event Mesh. We used those names, those keys, and those jobs. We did not invent a second accounts-payable model and then call it SAP.

We do not have a tenant for this demo. So the landscape here is simulated, and the simulation stays close to the real contracts. The invoice, the purchase order, the material document, and the business partner are read through local APIs that do the same work as `API_SUPPLIERINVOICE_PROCESS_SRV`, `API_PURCHASEORDER_PROCESS_SRV`, `API_MATERIAL_DOCUMENT_SRV`, and `API_BUSINESS_PARTNER`. A small topic, `POST /simulated-events`, stands in for Event Mesh: a CloudEvent is stored first, a repeat delivery does not open a second case, and the payload only names the invoice. The workbench then reads the invoice, the way a real subscriber would.

After the out-of-the-box process, we shaped the rest to the actual need, and to the time we had. Two evenings. The useful cut was a workbench where a person can see the comparison and approve one action. The advisor is a module in that same application. It chooses which reads to call and returns a recommendation. The invoice handlers call that module. They do not hand it a finished comparison, and it does not post. Money differences are calculated in the workbench, so a model cannot invent a price gap.

That split is the trade we made on purpose. One language, Node.js and TypeScript, and one process. The advisor stays a module so the tool loop is not tangled into the invoice handlers. SQLite instead of a platform database. A simulated queue instead of a broker we would not be allowed to point at a real system anyway. Quality here means the business meaning stays intact: a posted invoice is not edited in place, a price difference becomes a subsequent credit, a quantity gap is a conversation with the supplier, and a clean match can be released for payment. Releasing a block is not the same thing as paying it.

## What you see

Three invoices from Helios Fasteners GmbH.

| Invoice | What the reads show | What a person can approve |
| --- | --- | --- |
| `5100001001` | Invoiced 100.00 against a purchase-order net of 80.00. Quantity matches. | A subsequent credit of 20.00 EUR. The original invoice stays blocked. |
| `5100001002` | Price matches. Invoiced 10, received 8. | A draft email to the supplier. Nothing is posted. |
| `5100001003` | Price and quantity match, and the payment block is still set. | Release of the payment block. |

The list shows the supplier, the invoice reference, the amount, the currency, the raw payment block, and a block category we calculated ourselves. The detail page shows the invoice, the purchase-order items, the variance, and the recommendation.

## Run it

The build follows the tickets in `docs/tickets/`. Each ticket is committed on its own before the next one starts.

When the foundation ticket has landed:

```powershell
copy .env.example .env
docker compose up --build
```

The workbench is expected at `http://localhost:4004`. Leave `LLM_API_KEY` empty and the advisor follows a fixed policy. It still calls the tools. Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` if you want a model to choose the order of those calls and write the explanation.

No SAP host, client, or user is required.

## What is real SAP language, and what we simulated

The field names and the API jobs are taken from SAP S/4HANA Cloud Public Edition, as far as we could verify them on the Help Portal, in SAP notes, and on the Business Accelerator Hub. The notes are in [docs/architecture/sap-reference.md](docs/architecture/sap-reference.md). The running app does not connect to SAP.

The four service schemas are in `metadata/`, taken from the public sandbox `$metadata` on 2 November 2026. Release is the function import `Release`. A subsequent credit sets `IsSubsequentDebitCredit` and `SupplierInvoiceIsCreditMemo` to `X`. SAP's supplier invoice created event names the invoice. We read the invoice, and a non-empty `PaymentBlockingReason` is what makes it a blocked invoice. That value is the reason on the case. The package has no payment-block event. The running app does not call SAP.

## Limits we accepted

There is no payment run and no Finance-only payment block. The tolerance of 0.50 EUR is ours, not SAP invoice-verification customizing. Contacting the supplier stores a draft and does not send it. The dashboard is a later ticket, and the demo does not need it.

The design record is in [docs/adr](docs/adr) and the vocabulary is in [GLOSSARY.md](GLOSSARY.md).
