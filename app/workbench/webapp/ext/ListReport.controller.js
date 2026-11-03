sap.ui.define(["sap/m/MessageBox", "sap/ui/core/Fragment", "sap/ui/model/json/JSONModel"], function (MessageBox, Fragment, JSONModel) {
  "use strict";
  return {
    onAfterRendering: function () {
      if (this._summary) return;
      const view = this.getView();
      Fragment.load({ name: "workbench.ext.Dashboard", controller: this }).then((panel) => {
        this._summary = panel;
        const page = view.getContent()[0];
        const expanded = page && page.getTitle && page.getTitle();
        if (expanded && expanded.addExpandedContent) expanded.addExpandedContent(panel);
        view.setModel(new JSONModel({ pending: 0, closed: 0, released: 0, subsequentCreditPosted: 0, dismissed: 0, suppliers: [] }), "summary");
        this.refreshSummary();
      });
    },
    refreshSummary: async function () {
      const response = await fetch("/workbench/workbenchSummary()");
      if (!response.ok || !this.getView()) return;
      this.getView().getModel("summary").setData(await response.json());
    },
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
      if (this.refreshSummary) await this.refreshSummary();
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
