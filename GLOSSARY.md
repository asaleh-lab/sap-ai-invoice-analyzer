# Supplier invoice investigation

A local workbench that investigates a blocked supplier invoice and waits for a person to approve any financial action. The SAP business objects below are simulated from documented S/4HANA Cloud contracts. They are not a live SAP system.

## Language

**Supplier**:
The business partner from whom goods were purchased.
_Avoid_: Vendor, account

**Supplier invoice**:
The logistics invoice document posted against a purchase order. Its identity is the supplier invoice number together with the fiscal year.
_Avoid_: Bill, vendor invoice, AP document

**Purchase order**:
The purchasing document that agreed quantity and price with the supplier.

**Goods receipt**:
The material document that records receipt of ordered goods into stock. In this scenario that is a material document item with goods movement type 101.
_Avoid_: Delivery, inbound delivery, goods receipt confirmation

**Payment block**:
A block that stops the supplier invoice from being paid. Releasing it allows payment. It does not post a new invoice and it does not execute a payment.

**Payment block reason**:
The value of the supplier invoice field `PaymentBlockingReason`.
_Avoid_: Block category

**Block category**:
This project's calculated classification of why the invoice needs review, derived by comparing the invoice with the purchase order and the goods receipt.
_Avoid_: Payment block reason, SAP blocking reason code

**Subsequent credit**:
A new supplier invoice document that reduces the invoiced value of a purchase order item after the original invoice was posted, while leaving the invoiced quantity unchanged.
_Avoid_: Editing the original invoice, credit note, reversal

**Supplier credit memo**:
A supplier invoice posted as a credit, including cases that correct quantity, such as a return. A subsequent credit is a narrower value-only case of credit posting.
_Avoid_: Subsequent credit

**Investigation**:
The application-owned case for a supplier invoice whose payment block reason is set. It is not an SAP business object.
_Avoid_: Invoice, blocked invoice, workflow item, ticket

**Recommendation**:
The structured outcome of an investigation: a proposed human action and the variance amounts. It does not change SAP data.

**Human approval**:
An explicit workbench action by a person. The backend checks it before any simulated SAP write.

**Release payment block**:
The approved action that calls the supplier invoice release operation so a logistics invoice block can be removed.
_Avoid_: Post invoice, pay invoice, accept invoice

**Advisor**:
The part of the workbench that chooses read-only tools and returns a recommendation. It does not change SAP data.
_Avoid_: Invoice agent, the model

**Simulated Event Mesh**:
The local topic and inbox that accept a CloudEvent the way a subscriber to SAP Event Mesh would: store it first, survive a repeat delivery, and investigate the invoice once.
_Avoid_: Kafka, the broker

**Simulated SAP system**:
The local data, API adapters, and event topic that follow the documented S/4HANA Cloud names and the jobs those APIs do.
_Avoid_: SAP S/4HANA, the tenant, the backend
