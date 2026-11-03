sap.ui.define(["sap/ui/core/Fragment", "sap/ui/model/json/JSONModel"], function (Fragment, JSONModel) {
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
  };
});
