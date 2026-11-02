---
status: accepted
---

# Read and write simulated documents with CAP

Simulated invoices, purchase orders, material documents, and business partners are CDS entities in `sap.sim`. Handlers read and write them with CAP. The four sandbox `$metadata` files sit in `metadata/` so the local names follow those services. The SAP Cloud SDK is the client for a remote S/4 destination. This demo has no tenant, so that client has nothing to call. The sandbox API key can read the shared sandbox. It is not a dependency of this app.
