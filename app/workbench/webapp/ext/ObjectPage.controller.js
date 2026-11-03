sap.ui.define(["sap/ui/core/mvc/ControllerExtension", "sap/m/MessageBox"], function (ControllerExtension, MessageBox) {
  "use strict";
  const creditText =
    "A new subsequent credit was posted. The original invoice was not modified and remains blocked. IsSubsequentDebitCredit is X. The document number is a demo document number, not an SAP number range.";

  async function postAction(context, name, data) {
    const response = await fetch("/workbench/" + name, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(function () {
        return {};
      });
      MessageBox.error((body.error && body.error.message) || "The action was rejected.");
      return null;
    }
    await context.requestSideEffects(["*"]);
    return response.json();
  }

  return ControllerExtension.extend("workbench.ext.ObjectPage", {
    releasePaymentBlock: async function () {
      const context = this.getView().getBindingContext();
      if (!context || context.getProperty("recommendedAction") !== "release_payment_block") return;
      await postAction(context, "releasePaymentBlock", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
    },
    postSubsequentCredit: async function () {
      const context = this.getView().getBindingContext();
      if (!context || context.getProperty("recommendedAction") !== "post_subsequent_credit") return;
      const posted = await postAction(context, "postSubsequentCredit", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (posted) MessageBox.information(creditText);
    },
    prepareSupplierContact: async function () {
      const context = this.getView().getBindingContext();
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      const draft = await postAction(context, "prepareSupplierContact", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (draft) MessageBox.information("Draft to " + draft.emailDraftTo + " was stored and was not sent.\n\n" + draft.emailDraftBody);
    },
    dismissInvestigation: async function () {
      const context = this.getView().getBindingContext();
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      MessageBox.prompt("Why are you dismissing this case?", {
        title: "Dismiss",
        onClose: async function (action, value) {
          if (action !== MessageBox.Action.OK) return;
          if (!value || !value.trim()) {
            MessageBox.error("A dismiss reason is required.");
            return;
          }
          await postAction(context, "dismissInvestigation", {
            investigationId: context.getProperty("ID"),
            actor: "local.reviewer",
            reason: value.trim(),
          });
        },
      });
    },
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
