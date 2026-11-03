sap.ui.define(["sap/m/FlexItemData", "sap/ui/core/Fragment", "sap/ui/model/json/JSONModel"], function (FlexItemData, Fragment, JSONModel) {
  "use strict";
  return {
    onAfterRendering: function () {
      if (this._summary) return;
      const view = this.getView();
      Fragment.load({ id: view.getId(), name: "workbench.ext.Dashboard", controller: this }).then((panel) => {
        this._summary = panel;
        const page = view.getContent()[0];
        const content = page && page.getContent && page.getContent();
        if (content && page.setContent) {
          panel.setFitContainer(true);
          panel.setHeight("100%");
          content.setLayoutData(new FlexItemData({ growFactor: 1, baseSize: "0%" }));
          page.setContent(panel);
          panel.addItem(content);
          this._caseList = content;
        }
        view.setModel(
          new JSONModel({
            pending: 0,
            closed: 0,
            released: 0,
            subsequentCreditPosted: 0,
            dismissed: 0,
            contactDrafts: 0,
            releasedShare: 0,
            creditShare: 0,
            dismissedShare: 0,
            suppliers: [],
            supplierPage: 1,
            supplierPages: 1,
          }),
          "summary",
        );
        this.refreshSummary();
        this.onWorkbenchTab({ getParameter: () => "dashboard" });
        this._onWorkbenchResize = () => this._sizeSupplierGrid();
        window.addEventListener("resize", this._onWorkbenchResize);
        setTimeout(() => this._prepareCaseTable(), 300);
        setTimeout(() => this._prepareCaseTable(), 800);
        setTimeout(() => this._sizeSupplierGrid(), 300);
      });
    },
    _prepareCaseTable: function () {
      this._hideBuiltInViews();
      const table = this.byId("fe::TabMultipleMode");
      if (!table || !table.getDomRef()) return;
      if (!table._workbenchHook) {
        table._workbenchHook = true;
        const render = table.onAfterRendering;
        const controller = this;
        table.onAfterRendering = function () {
          if (render) render.apply(this, arguments);
          controller._sizeCaseTable();
        };
      }
      this._sizeCaseTable();
      const body = this.byId("dashboardBody");
      this._showFilters(!body || !body.getVisible());
      this._sizeSupplierGrid();
    },
    _sizeCaseTable: function () {
      const table = this.byId("fe::TabMultipleMode");
      const dom = table && table.getDomRef && table.getDomRef();
      if (!dom) return;
      const dashboard = this.byId("dashboardBody");
      const showList = !dashboard || !dashboard.getVisible();
      dom.style.minHeight = showList ? "70vh" : "0";
      dom.style.display = showList ? "block" : "none";
      const head = document.getElementById(table.getId() + "--header");
      if (head) head.style.display = "none";
    },
    _hideBuiltInViews: function () {
      const own = this.byId("workbenchTabs");
      this.getView().findAggregatedObjects(true).forEach((control) => {
        if (!control.isA || control === own) return;
        const items = control.getItems ? control.getItems() : [];
        const texts = items.map((item) => (item.getText ? item.getText() : ""));
        if (texts.some((text) => text.startsWith("Pending")) && texts.some((text) => text.startsWith("Processed"))) this._hideTabStrip(control);
      });
    },
    onWorkbenchTab: function (event) {
      const item = event.getParameter("item");
      const key = item && item.getKey ? item.getKey() : event.getParameter("key");
      const body = this.byId("dashboardBody");
      if (body) body.setVisible(key === "dashboard");
      this._showCaseList(key !== "dashboard");
      this._showFilters(key !== "dashboard");
      if (key === "pending") this._selectCaseView("Pending");
      if (key === "processed") this._selectCaseView("Processed");
      this._prepareCaseTable();
    },
    showPending: function () {
      const tabs = this.byId("workbenchTabs");
      if (tabs) tabs.setSelectedKey("pending");
      this.onWorkbenchTab({ getParameter: () => "pending" });
    },
    showProcessed: function () {
      const tabs = this.byId("workbenchTabs");
      if (tabs) tabs.setSelectedKey("processed");
      this.onWorkbenchTab({ getParameter: () => "processed" });
    },
    refreshSummary: async function () {
      const response = await fetch("/workbench/workbenchSummary()");
      if (!response.ok || !this.getView()) return;
      const summary = await response.json();
      const scale = Math.max(summary.released || 0, summary.subsequentCreditPosted || 0, summary.dismissed || 0, 1);
      summary.releasedShare = ((summary.released || 0) / scale) * 100;
      summary.creditShare = ((summary.subsequentCreditPosted || 0) / scale) * 100;
      summary.dismissedShare = ((summary.dismissed || 0) / scale) * 100;
      summary.suppliers = (summary.suppliers || [])
        .slice()
        .sort((left, right) => right.pendingCount - left.pendingCount || left.supplierName.localeCompare(right.supplierName));
      summary.supplierPage = 1;
      summary.supplierPages = 1;
      const model = this.getView().getModel("summary");
      model.setSizeLimit(Math.max(summary.suppliers.length, 100));
      model.setData(summary);
      setTimeout(() => this._syncSupplierPager(), 0);
    },
    _sizeSupplierGrid: function () {
      const table = this.byId("supplierGrid");
      const body = this.byId("dashboardBody");
      const dom = table && table.getDomRef && table.getDomRef();
      if (!table || !dom || !body || !body.getVisible()) return;
      const bottomGap = 16;
      const height = Math.max(window.innerHeight - dom.getBoundingClientRect().top - bottomGap, 280);
      if (table.getHeight() !== height + "px") table.setHeight(height + "px");
    },
    onSupplierRowsUpdated: function () {
      this._syncSupplierPager();
    },
    onSupplierPagePrevious: function () {
      this._moveSupplierPage(-1);
    },
    onSupplierPageNext: function () {
      this._moveSupplierPage(1);
    },
    _moveSupplierPage: function (direction) {
      const table = this.byId("supplierGrid");
      if (!table) return;
      const visible = Math.max(table.getVisibleRowCount(), 1);
      const total = (this.getView().getModel("summary").getProperty("/suppliers") || []).length;
      const lastStart = Math.max(total - visible, 0);
      const next = Math.min(Math.max(table.getFirstVisibleRow() + direction * visible, 0), lastStart);
      table.setFirstVisibleRow(next);
      this._syncSupplierPager();
    },
    _syncSupplierPager: function () {
      const table = this.byId("supplierGrid");
      const model = this.getView() && this.getView().getModel("summary");
      if (!table || !model) return;
      const visible = Math.max(table.getVisibleRowCount(), 1);
      const total = (model.getProperty("/suppliers") || []).length;
      const pages = Math.max(Math.ceil(total / visible), 1);
      const page = Math.min(Math.floor(table.getFirstVisibleRow() / visible) + 1, pages);
      model.setProperty("/supplierPages", pages);
      model.setProperty("/supplierPage", page);
    },
    _hideTabStrip: function (control) {
      const dom = control.getDomRef && control.getDomRef();
      const head = (dom && dom.querySelector(".sapMITBHead, .sapMSegB")) || document.getElementById(control.getId() + "--header");
      if (head) head.style.display = "none";
      if (dom) {
        dom.style.minHeight = "70vh";
        dom.style.display = "block";
      }
    },
    _showFilters: function (visible) {
      this.getView().findAggregatedObjects(true).forEach((control) => {
        if (!control.isA || !control.setVisible) return;
        const name = control.getMetadata().getName();
        const id = control.getId ? control.getId() : "";
        if (name.indexOf("FilterBar") >= 0 || id.indexOf("FilterBar") >= 0) control.setVisible(visible);
      });
      const root = this.getView().getDomRef && this.getView().getDomRef();
      if (!root) return;
      root.querySelectorAll(".sapMListReportFilter, .sapUiMdcFilterBar, [id*='FilterBar']").forEach((node) => {
        node.style.display = visible ? "" : "none";
      });
    },
    _showCaseList: function (visible) {
      if (this._caseList && this._caseList.setVisible) {
        this._caseList.setVisible(visible);
        const dom = this._caseList.getDomRef && this._caseList.getDomRef();
        if (dom) dom.style.minHeight = visible ? "70vh" : "";
      }
    },
    _selectCaseView: function (label) {
      const own = this.byId("workbenchTabs");
      const controls = this.getView().findAggregatedObjects(true);
      controls.forEach((control) => {
        if (!control.isA || own === control) return;
        if (control.isA("sap.m.IconTabBar")) {
          const item = (control.getItems() || []).find((entry) => entry.getText && entry.getText().startsWith(label));
          if (!item) return;
          this._hideTabStrip(control);
          control.setSelectedKey(item.getKey());
          control.fireSelect({ key: item.getKey(), item: item });
        }
        if (control.isA("sap.m.SegmentedButton")) {
          const item = (control.getItems() || []).find((entry) => entry.getText && entry.getText().startsWith(label));
          if (!item) return;
          this._hideTabStrip(control);
          control.setSelectedKey(item.getKey());
          control.fireSelectionChange({ item: item });
        }
      });
    },
  };
});
