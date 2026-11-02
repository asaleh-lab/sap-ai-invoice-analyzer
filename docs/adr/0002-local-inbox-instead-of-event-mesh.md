---
status: accepted
---

# Simulate Event Mesh with a durable inbox

This demo has no SAP Event Mesh tenant. The consumer contract is what we keep: a CloudEvent arrives on a topic, it is stored before any business work, and a second delivery of the same event does not open a second investigation.

The workbench exposes that topic as `POST /simulated-events`. SQLite holds the event the way a subscribed queue would hold it. Retries read the same row. We do not add Kafka or a real broker.

The accepted event is the Public Edition type for a posted supplier invoice, `sap.s4.beh.supplierinvoice.v1.SupplierInvoice.Created.v1`. Its payload names the invoice. The consumer then reads the supplier invoice. A non-empty `PaymentBlockingReason` means that supplier invoice is blocked, and the investigation stores that value as the payment block reason. An empty reason means the invoice is not blocked, so no investigation opens. Canceled is a reversal, not a trigger. We do not add an event type for a payment block. The field list is in [sap-reference.md](../architecture/sap-reference.md).
