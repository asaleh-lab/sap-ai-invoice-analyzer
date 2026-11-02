# Tool catalog

The advisor calls these tools through functions the workbench passes in. The tool name is a project name. The SAP API column is the contract being simulated. Field names follow the files in [metadata/](../../metadata/) and [sap-reference.md](sap-reference.md).

Every tool the agent can call is read-only. Release and subsequent credit are not tools. They are investigation actions in ticket 007.

The local adapter reads `sap.sim` entities through CAP and returns JSON. It does not call api.sap.com. Errors use a project envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Supplier invoice 5100001999/2026 was not found in the simulated S/4 data." } }
```

Codes: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT` (reserved for writes, unused here).

## `get_supplier_invoice`

| | |
| --- | --- |
| SAP API | `API_SUPPLIERINVOICE_PROCESS_SRV` |
| Operation simulated | `GET A_SupplierInvoice(SupplierInvoice,FiscalYear)` with `to_SuplrInvcItemPurOrdRef` expanded |
| Purpose | Load the blocked invoice the event identified. |
| Read or write | Read-only |
| Documentation | Hub catalog entry, KBA 3439469, KBA 3644600, SAP Help test script 5FN, SAP automation package field list |

Input:

```json
{ "SupplierInvoice": "5100001001", "FiscalYear": "2026" }
```

Both fields are required.

Output (trimmed to the verified subset):

```json
{
  "SupplierInvoice": "5100001001",
  "FiscalYear": "2026",
  "CompanyCode": "1010",
  "DocumentDate": "2026-10-28",
  "PostingDate": "2026-10-28",
  "InvoicingParty": "17300001",
  "SupplierInvoiceIDByInvcgParty": "HF-2026-441",
  "DocumentCurrency": "EUR",
  "InvoiceGrossAmount": "119.00",
  "PaymentBlockingReason": "A",
  "SupplierInvoiceStatus": "5",
  "SupplierInvoiceIsCreditMemo": "",
  "to_SuplrInvcItemPurOrdRef": [
    {
      "SupplierInvoiceItem": "1",
      "PurchaseOrder": "4500001001",
      "PurchaseOrderItem": "10",
      "Plant": "1010",
      "DocumentCurrency": "EUR",
      "SupplierInvoiceItemAmount": "100.00",
      "QuantityInPurchaseOrderUnit": "10",
      "PurchaseOrderQuantityUnit": "PC",
      "ReferenceDocument": "5000001001",
      "ReferenceDocumentFiscalYear": "2026",
      "ReferenceDocumentItem": "1"
    }
  ]
}
```

`SupplierInvoiceStatus` value `"5"` is an example seen in a third-party capture of this API. The seed may use it only as an opaque posted status, and the UI must not translate it until a code list is checked.

Errors: missing key `BAD_REQUEST`; unknown invoice `NOT_FOUND`.

Local behavior: one header row and its PO-reference items. Amounts are decimal strings, as OData often serializes them.

## `get_purchase_order`

| | |
| --- | --- |
| SAP API | `API_PURCHASEORDER_PROCESS_SRV` |
| Operation simulated | `GET A_PurchaseOrder('{PurchaseOrder}')` with items expanded |
| Purpose | Load ordered quantity and net price for the invoice item. |
| Read or write | Read-only |
| Documentation | Sandbox `$metadata`, Hub catalog 1.0.0, KBA 2928975, KBA 3218443. |

Input:

```json
{ "PurchaseOrder": "4500001001" }
```

Output:

```json
{
  "PurchaseOrder": "4500001001",
  "Supplier": "17300001",
  "CompanyCode": "1010",
  "DocumentCurrency": "EUR",
  "to_PurchaseOrderItem": [
    {
      "PurchaseOrder": "4500001001",
      "PurchaseOrderItem": "10",
      "Material": "FASTENER-M8",
      "OrderQuantity": "10",
      "PurchaseOrderQuantityUnit": "PC",
      "NetPriceAmount": "8.00",
      "NetPriceQuantity": "1"
    }
  ]
}
```

Those header and item names, and the navigation `to_PurchaseOrderItem`, are the names in [metadata/API_PURCHASEORDER_PROCESS_SRV.edmx](../../metadata/API_PURCHASEORDER_PROCESS_SRV.edmx). `NetPriceAmount` is decimal 12.3 and `NetPriceQuantity` is decimal 5.0.

Errors: missing `PurchaseOrder` `BAD_REQUEST`; unknown order `NOT_FOUND`.

## `get_goods_receipts`

| | |
| --- | --- |
| SAP API | `API_MATERIAL_DOCUMENT_SRV` |
| Operation simulated | Read material document items whose `PurchaseOrder` and `PurchaseOrderItem` match, `GoodsMovementRefDocType` is `B`, and `GoodsMovementType` is `101` |
| Purpose | Sum the quantity received for the purchase-order item. |
| Read or write | Read-only |
| Documentation | Hub catalog, SAP Cloud SDK header key, KBA 3562938, KBA 3651756 |

This is not `SSPOPENITMGOODSRECEIPT_0001`.

Input:

```json
{ "PurchaseOrder": "4500001001", "PurchaseOrderItem": "10" }
```

Both fields are required.

Output:

```json
{
  "PurchaseOrder": "4500001001",
  "PurchaseOrderItem": "10",
  "items": [
    {
      "MaterialDocument": "5000001001",
      "MaterialDocumentYear": "2026",
      "MaterialDocumentItem": "1",
      "GoodsMovementType": "101",
      "GoodsMovementRefDocType": "B",
      "QuantityInEntryUnit": "10",
      "EntryUnit": "PC",
      "Material": "FASTENER-M8",
      "Plant": "1010",
      "PostingDate": "2026-10-20"
    }
  ]
}
```

An empty `items` array is a successful read: nothing was received. It is not `NOT_FOUND`.

Errors: missing input `BAD_REQUEST`.

Local behavior: filter `sap.sim` material document items. The agent must not assume a single goods receipt. The variance tool sums `QuantityInEntryUnit`.

## `get_supplier_invoice_history`

| | |
| --- | --- |
| SAP API | `API_SUPPLIERINVOICE_PROCESS_SRV` |
| Operation simulated | `GET A_SupplierInvoice?$filter=InvoicingParty eq '{InvoicingParty}'&$top=20` |
| Purpose | See whether this supplier already has other blocked invoices. There is no separate history API. |
| Read or write | Read-only |
| Documentation | Same supplier invoice API. KBA 3644600 requires a filter. |

Input:

```json
{ "InvoicingParty": "17300001" }
```

Output: an array of headers only, using the same header fields as `get_supplier_invoice`, without items. The current invoice may appear in the list. The agent treats that row as the current document, not as independent history.

Errors: missing supplier `BAD_REQUEST`. An empty array is success.

## `get_supplier_business_partner`

| | |
| --- | --- |
| SAP API | `API_BUSINESS_PARTNER` |
| Operation simulated | Read `A_BusinessPartner` for the supplier, the supplier role, one contact relationship, and one `EmailAddress` |
| Purpose | Show who would receive a supplier message. |
| Read or write | Read-only |
| Documentation | Hub catalog, KBA 3569467, KBA 3392200, SAP Developer Center tutorial for `A_AddressEmailAddress` |

Input:

```json
{ "Supplier": "17300001" }
```

The value is the invoice `InvoicingParty`.

Output:

```json
{
  "BusinessPartner": "17300001",
  "BusinessPartnerName": "Helios Fasteners GmbH",
  "Supplier": "17300001",
  "EmailAddress": "ap@helios-fasteners.example",
  "contact": {
    "AddressID": "1730000101",
    "Person": "1730000102",
    "OrdinalNumber": "001"
  }
}
```

`EmailAddress` may be null when the simulated partner has no email. The tool still returns `200`. The contact draft action then reports missing contact information. The simulated data stores the email row (`AddressID`, `Person`, `OrdinalNumber`), not an `A_BusinessPartnerContact` relationship, so `contact` uses those email key fields.

Errors: missing `Supplier` `BAD_REQUEST`; unknown partner `NOT_FOUND`.

## `calculate_invoice_variance`

| | |
| --- | --- |
| SAP API | None. Project calculation over the three reads above. |
| Purpose | Produce the amounts the recommendation is allowed to cite. |
| Read or write | Read-only |
| Documentation | Comparison rules in this file. SAP tolerance customizing is not reproduced. |

Input: the same invoice key. The tool calls the three document reads itself so the model cannot pass a hand-edited amount.

Output:

```json
{
  "comparable": true,
  "DocumentCurrency": "EUR",
  "invoicedQuantity": "10",
  "orderedQuantity": "10",
  "receivedQuantity": "10",
  "quantityDifference": "0",
  "invoiceItemAmount": "100.00",
  "purchaseOrderNetAmount": "80.00",
  "priceDifference": "20.00",
  "grossAmount": "119.00",
  "grossAmountExcludedFromMatch": true,
  "missing": []
}
```

Rules, applied per PO-reference item and summed when units match:

- Received quantity is the sum of movement type `101` in `EntryUnit`.
- Quantity difference is invoiced quantity minus received quantity, and it is computed only when `PurchaseOrderQuantityUnit` equals `EntryUnit`. Otherwise `comparable` is false and `missing` explains the unit mismatch.
- Purchase-order net amount is `NetPriceAmount / NetPriceQuantity * invoiced quantity` when `NetPriceQuantity` is present and not zero. The seed uses `NetPriceQuantity` `1`.
- Price difference is `SupplierInvoiceItemAmount` minus that net amount.
- `InvoiceGrossAmount` is returned and is excluded from the match because it includes tax.
- A missing purchase order, a missing item, or an empty goods-receipt list does not throw. `comparable` is false or the received quantity is zero, and `missing` lists the gap.
- No tolerance lives inside this tool. The agent policy compares `priceDifference` with the project tolerance stored on the investigation service (seed default: `0.50` in document currency). The tolerance is project configuration, described as such in the recommendation.

Errors: unknown invoice `NOT_FOUND`.

## Agent policy

The agent may call tools in any order. The service that stores the recommendation rejects a result unless:

1. `get_supplier_invoice` was called for this case's invoice key, and the evidence rows include that response.
2. Every cited amount equals a field on a tool response or a field on `calculate_invoice_variance`.
3. `recommendedAction` is one of `release_payment_block`, `post_subsequent_credit`, `contact_supplier`, `dismiss`, `insufficient_evidence`.
4. `post_subsequent_credit` is allowed only when `comparable` is true, quantity difference is zero, and price difference is greater than the project tolerance.
5. `release_payment_block` is allowed only when `comparable` is true, quantity difference is zero, and the absolute price difference is within the project tolerance.
6. Quantity difference above zero, or `comparable` false, cannot recommend release or subsequent credit. The allowed actions are `contact_supplier`, `dismiss`, or `insufficient_evidence`.

The scripted policy, used when no model key is configured, implements those rules directly after calling invoice, then purchase order and goods receipts when a PO reference exists, then the variance tool, then the business partner. History is called when `InvoicingParty` is present. A model may skip history. It may not skip the invoice read or the variance tool when a PO reference exists.

Findings stored with the recommendation:

| Kind | Meaning |
| --- | --- |
| `fact` | A sentence that quotes evidence. |
| `assumption` | A project rule, such as the tolerance, stated as a rule. |
| `missing` | A read that returned no row or a unit that blocked comparison. |

Evidence row: `api`, `entity`, `key`, `field`, `value`. Example: api `API_SUPPLIERINVOICE_PROCESS_SRV`, entity `A_SuplrInvcItemPurOrdRef`, key `5100001001/2026/1`, field `SupplierInvoiceItemAmount`, value `100.00`.

## Seeded cases the tools must support

| Invoice | What the reads show | Action the policy may recommend |
| --- | --- | --- |
| `5100001001` / `2026` | Item amount 100.00, PO net 80.00, quantity 10 ordered, invoiced, and received | `post_subsequent_credit` for `20.00` EUR |
| `5100001002` / `2026` | Price matches, invoiced 10, received 8 | `contact_supplier` |
| `5100001003` / `2026` | Price and quantity match, `PaymentBlockingReason` is set | `release_payment_block` |

Supplier `17300001` also has an older unblocked invoice `5100000900` so history is non-empty. Details of the seed rows are written in ticket 002.
