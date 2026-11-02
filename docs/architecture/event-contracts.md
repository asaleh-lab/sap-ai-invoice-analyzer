# Event contracts

The workbench starts from the Public Edition event for a posted supplier invoice. The topic is `POST /simulated-events`. The SQLite inbox is the queue. Delivery is treated as at-least-once. The event names the invoice. The consumer reads the supplier invoice and opens an investigation only when `PaymentBlockingReason` is set. That value is the payment block reason on the case. See [sap-reference.md](sap-reference.md).

## Envelope and payload

CloudEvents 1.0 attributes are the envelope. The SAP-shaped content is only `data`.

| Attribute | Value |
| --- | --- |
| `specversion` | `1.0` |
| `id` | Unique event id. The inbox idempotency key. |
| `source` | `local/demo/simulated-s4` |
| `type` | `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1` |
| `time` | RFC 3339 timestamp |
| `datacontenttype` | `application/json` |
| `subject` | `{SupplierInvoice}/{FiscalYear}` |
| `data.SupplierInvoice` | Supplier invoice number. Same name as the OData key. |
| `data.FiscalYear` | Fiscal year. Same name as the OData key. |
| `data.SupplierInvoiceFiscalYear` | Same fiscal year, as in the Hub payload. When present it equals `FiscalYear`. |

`data` has no amount, supplier, or payment block reason. The consumer loads the supplier invoice. A non-empty `PaymentBlockingReason` means the invoice is blocked, and the investigation stores that reason.

```json
{
  "specversion": "1.0",
  "id": "8f1c0d2a-6b4e-4a1a-9c3e-1b7e5a0d4f11",
  "source": "local/demo/simulated-s4",
  "type": "sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1",
  "time": "2026-11-02T09:15:00Z",
  "datacontenttype": "application/json",
  "subject": "5100001001/2026",
  "data": {
    "SupplierInvoice": "5100001001",
    "FiscalYear": "2026",
    "SupplierInvoiceFiscalYear": "2026"
  }
}
```

The Hub package also publishes `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Canceled.v1` for a reversed invoice. The inbox does not treat that type as an investigation trigger. A guessed type such as `SupplierInvoice.Blocked` is not in the package and is not added.

## How this maps to a real integration

In a tenant, Enterprise Event Enablement would publish a business event to SAP Event Mesh, and a queue subscription would push it to the extension. This demo simulates that hop. `POST /simulated-events` is the topic. The body is the CloudEvent. The endpoint writes the inbox row, which is the queue, and returns `202` once the row is durable. Investigation work happens after that commit. A repeat of the same event id is the at-least-once case the consumer must survive.

## Validation

Reject, persist the attempt when the body can be stored, and do not open an investigation when:

- `specversion` is not `1.0`
- `type` is not `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1`
- `id`, `source`, or `data` is missing
- `data.SupplierInvoice` or `data.FiscalYear` is empty
- `data.SupplierInvoiceFiscalYear` is present and differs from `data.FiscalYear`
- the JSON is not an object

HTTP `400` for a malformed event. The response body is a project error, not an SAP message.

## Idempotency and duplicates

| Situation | Inbox | Investigation |
| --- | --- | --- |
| New `id`, invoice exists, payment block is set, no open investigation | `processed` | One new investigation |
| Same `id` delivered again | `duplicate` | No second investigation. Response points at the original inbox row. |
| New `id`, an investigation for that invoice and fiscal year is still open | `duplicate_open_case` | No second open investigation. The new id is noted on the open case. |
| New `id`, previous investigation for that invoice is closed | `processed` | A new investigation may open. A block can be raised again after a release. |
| Invoice key not found | `rejected` | None |
| Invoice found and `PaymentBlockingReason` is empty | `rejected` | None. The supplier invoice is not blocked. |

The unique key of the inbox is `id`. Processing checks the open investigation as a second guard so two different ids cannot open two active cases for one invoice.

## Processing statuses

Inbox status, in order:

1. `received` — row committed, not yet handled
2. `processed` — an investigation was created or an existing closed case was followed by a new one
3. `duplicate` — same `id` already stored
4. `duplicate_open_case` — different `id`, open investigation already exists
5. `rejected` — payload valid as a CloudEvent, business checks failed
6. `invalid` — payload failed structural validation
7. `failed` — investigation processing threw after the row was stored

Investigation status is separate and is defined in [data-model.md](data-model.md).

## Retry and failure

The inbox row is the unit of retry. A crash after `received` and before the investigation exists is retried by running the consumer again for rows in `received` or `failed`. Retry reuses the same `id`, so it cannot create a second case.

Agent failure after the case exists sets the investigation to `investigation_failed` and the inbox to `failed`. A retry continues that investigation. It does not create another one.

There is no poison-message queue. After three failed attempts the row stays `failed` and the workbench shows it. A person can trigger one more run from the case. Automatic infinite retry is out of scope.

The HTTP handler does not run the agent inside the request. It stores the event, returns `202`, and a CAP listener or a short in-process job drains `received` rows. That is the durable part. Restarting the process leaves the SQLite row in place because the database file is on a volume, not `:memory:`, in the Compose setup. Tests may use `:memory:`.

## Sample outcomes used by tests

| Event id | Invoice | Expected inbox result |
| --- | --- | --- |
| `evt-price-1` | `5100001001` / `2026` | `processed`, one investigation |
| `evt-price-1` again | same | `duplicate` |
| `evt-price-2` while the first case is open | `5100001001` / `2026` | `duplicate_open_case` |
| `evt-missing` | `5100001999` / `2026` | `rejected` |
| `evt-unblocked` | a seeded invoice with no `PaymentBlockingReason` | `rejected` |
| body missing `data.FiscalYear` | — | `invalid` |
