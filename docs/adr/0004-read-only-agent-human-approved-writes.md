---
status: accepted
---

# The advisor may read, and a person must approve writes

The advisor chooses which simulated SAP reads to call and must ground every finding in those responses. A model must not post a financial document on its own.

A write is a tool call. `sendEmail` is the pattern: the call returns `confirmationRequired` and changes nothing until the person confirms, and only then does the tool run with `Confirmed` true. An invoice update uses the same pattern. The tool may change the simulated invoice only after that confirmation. The confirmation is what closes the case and writes `invc.Decisions`. A second confirm does not apply the change again.
