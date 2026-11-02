---
status: accepted
---

# The advisor is a module in the CAP app

The tool loop and the workbench run in one Node.js process. The advisor is a TypeScript module. The workbench calls it with an objective, the invoice key, and the read-only tool functions. The module does not import the CDS model and does not post financial documents. An empty model key runs a scripted policy in that same module. The workbench still computes the money differences.

For this proof of concept the module boundary is the split. Compose runs one app and the SQLite file. A second process can wait until a second caller exists.
