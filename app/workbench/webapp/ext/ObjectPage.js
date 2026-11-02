sap.ui.define([], function () {
  "use strict";
  return {
    retryInvestigation: async function () {
      const context = this.getBindingContext();
      const id = context && context.getProperty("ID");
      if (!id || context.getProperty("status") !== "investigation_failed") return;
      await fetch("/workbench/retryInvestigation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ID: id }),
      });
      if (context.requestSideEffects) await context.requestSideEffects(["*"]);
    },
  };
});
