sap.ui.define(["sap/ui/core/mvc/ControllerExtension"], function (ControllerExtension) {
  "use strict";
  return ControllerExtension.extend("workbench.ext.ListReport", {
    sendSampleEvents: async function () {
      const response = await fetch("sample-events.json");
      const events = await response.json();
      for (const event of events) {
        await fetch("/simulated-events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        });
      }
      const extension = this.base.getExtensionAPI();
      if (extension.refresh) extension.refresh();
    },
  });
});
