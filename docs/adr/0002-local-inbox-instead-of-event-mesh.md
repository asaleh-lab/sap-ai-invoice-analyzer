---
status: accepted
---

# Simulate Event Mesh with a durable inbox

This demo has no SAP Event Mesh tenant. The consumer contract is what we keep: a CloudEvent arrives on a topic, it is stored before any business work, and a second delivery of the same event does not open a second investigation.

The workbench exposes that topic as `POST /simulated-events`. SQLite holds the event the way a subscribed queue would hold it. Retries read the same row. We do not add Kafka or a real broker. The event type stays a labeled synthetic type, because no official blocked-invoice event was verified. The envelope and the key-only payload follow the S/4 business-event shape in [sap-reference.md](../architecture/sap-reference.md).
