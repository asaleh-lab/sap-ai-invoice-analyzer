sap.ui.define(["sap/m/MessageBox"], function (MessageBox) {
  "use strict";
  return {
    sendSampleEvents: async function () {
      const response = await fetch("/workbench-ui/sample-events.json");
      const events = await response.json();
      let duplicates = 0;
      for (const event of events) {
        const posted = await fetch("/simulated-events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        });
        const body = await posted.json().catch(function () {
          return {};
        });
        if (!posted.ok) {
          MessageBox.error("A sample event was rejected.");
          return;
        }
        if (body.status === "duplicate") duplicates += 1;
      }
      const wanted = ["5100001001", "5100001002", "5100001003"];
      const deadline = Date.now() + 20000;
      let pending = [];
      while (Date.now() < deadline) {
        const listed = await fetch("/workbench/Investigations?$select=supplierInvoice,status");
        const body = await listed.json();
        const rows = body.value || [];
        const settled = wanted.every((invoice) =>
          rows.some((row) => row.supplierInvoice === invoice && row.status !== "open" && row.status !== "investigating"),
        );
        pending = rows.filter((row) => row.status !== "closed");
        if (settled || duplicates === events.length) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (this.refresh) await this.refresh();
      if (duplicates === events.length) {
        MessageBox.information(
          "These three sample events were already received, so no new cases were opened. Pending cases on the list: " + pending.length + ".",
        );
        return;
      }
      MessageBox.information("Sample events were sent. Pending cases on the list: " + pending.length + ".");
    },
  };
});
