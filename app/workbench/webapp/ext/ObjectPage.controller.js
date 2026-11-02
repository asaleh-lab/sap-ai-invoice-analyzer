sap.ui.define(["sap/ui/core/mvc/ControllerExtension"], function (ControllerExtension) {
  "use strict";
  return ControllerExtension.extend("workbench.ext.ObjectPage", {
    retryInvestigation: async function () {
      const context = this.getView().getBindingContext();
      const id = context && context.getProperty("ID");
      if (!id || context.getProperty("status") !== "investigation_failed") return;
      await fetch("/workbench/retryInvestigation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ID: id }),
      });
      await context.requestSideEffects(["*"]);
    },
  });
});
