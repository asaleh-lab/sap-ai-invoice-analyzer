sap.ui.define([], function () {
  "use strict";
  return {
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
      const extension = this.base && this.base.getExtensionAPI ? this.base.getExtensionAPI() : null;
      if (extension && extension.refresh) extension.refresh();
    },
  };
});
