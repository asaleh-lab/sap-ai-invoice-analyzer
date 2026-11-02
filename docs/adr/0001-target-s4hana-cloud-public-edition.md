---
status: accepted
---

# Simulate SAP S/4HANA Cloud Public Edition

The demo needs one coherent set of released APIs for supplier invoices, purchase orders, goods receipts, and suppliers. SAP S/4HANA Cloud Public Edition publishes those as OData APIs on the Business Accelerator Hub, scoped by communication scenarios. The local project stores simulated documents in those shapes and never claims a connection to a tenant.

On-premise packages such as `OP_API_SUPPLIERINVOICE_PROCESS_SRV`, ECC BAPIs, and SAP Business ByDesign supplier-invoice services use different contracts. Mixing them would make the portfolio story false. Private Edition can expose the same released APIs, and it can also expose custom CDS that Public Edition does not. The demo follows the Public Edition released surface only.
