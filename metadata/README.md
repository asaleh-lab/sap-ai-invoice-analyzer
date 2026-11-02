# Service schemas

Local copies of the contracts the demo follows. The application does not call a SAP host, the sandbox, or the Business Accelerator Hub at runtime. The sandbox API key used to download these files is not stored in this repo.

The four `.edmx` files are `$metadata` from `https://sandbox.api.sap.com` on 2 November 2026, for the Public Edition services listed on the Hub that day. The event file is the signed-in Hub specification for package `CE_SUPPLIERINVOICEEVENTS`.

| File | Hub catalog version | What it is |
| --- | --- | --- |
| `API_SUPPLIERINVOICE_PROCESS_SRV.edmx` | 1.6.0 | Supplier Invoice, OData V2 |
| `API_PURCHASEORDER_PROCESS_SRV.edmx` | 1.0.0 | Purchase Order, OData V2 |
| `API_MATERIAL_DOCUMENT_SRV.edmx` | 1.5.0 | Material Documents - Read, Create, OData V2 |
| `API_BUSINESS_PARTNER.edmx` | 1.7.0 | Business Partner (A2X), OData V2 |
| `CE_SUPPLIERINVOICEEVENTS.asyncapi.json` | 1.0.0 | Supplier Invoice Events. Created and canceled only. |

`sap:schema-version` inside an EDMX is `1`. That annotation is not the Hub package version. The package versions in the table were read from the signed-in catalog on the same date.

Vocabulary references in the EDMX files are relative paths. These copies do not name a customer tenant.
