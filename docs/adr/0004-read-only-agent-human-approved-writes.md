---
status: accepted
---

# The advisor may read, and a person must approve writes

The advisor chooses which simulated SAP reads to call and must ground every finding in those responses. Giving the advisor the release operation or the subsequent-credit create operation would let a model post a financial document.

Read tools and write actions are separate. Write actions exist only on the investigation service. Each one checks the open case, the recommendation, and the current simulated documents, then calls the simulated SAP write. A second submit of the same decision does not post a second document.
