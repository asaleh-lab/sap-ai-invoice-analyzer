sap.ui.define([], function () {
  "use strict";
  return {
    setColumnDistributionModel: async function () {
      const view = this.getView();
      this.fclStateCache = this.getFCLPersonalizationData();
      const stored = await this.fclStateCache;
      const distribution = stored && stored.columnsDistribution;
      if (!distribution) return;
      const apply = () => {
        const model = view.getModel("internal");
        if (!model) return false;
        model.setProperty("/FCLColumnsDistribution", distribution);
        return true;
      };
      if (apply()) return;
      const delegate = {
        onBeforeRendering: function () {
          if (apply()) view.removeEventDelegate(delegate);
        },
      };
      view.addEventDelegate(delegate);
    },
  };
});
