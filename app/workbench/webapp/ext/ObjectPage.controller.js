sap.ui.define(
  ["sap/m/MessageBox", "sap/m/Dialog", "sap/m/Button", "sap/m/TextArea", "sap/m/VBox", "sap/m/Text", "sap/m/Input", "sap/m/ScrollContainer"],
  function (MessageBox, Dialog, Button, TextArea, VBox, Text, Input, ScrollContainer) {
  "use strict";
  function text(key, args) {
    const component = Object.values(sap.ui.core.Component.registry.all()).find((entry) => entry.getModel && entry.getModel("i18n"));
    return component.getModel("i18n").getResourceBundle().getText(key, args);
  }

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
      MessageBox.error((body.error && body.error.message) || text("actionRejected"));
      return null;
    }
    await context.requestSideEffects(["status", "paymentBlockingReason", "outcome", "closedAt"]);
    return response.json();
  }

  function caseContext(value) {
    if (value && value.getProperty) return value;
    const source = value && value.getSource && value.getSource();
    return source && source.getBindingContext ? source.getBindingContext() : null;
  }

  return {
    releasePaymentBlock: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("recommendedAction") !== "release_payment_block") return;
      await postAction(context, "releasePaymentBlock", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
    },
    postSubsequentCredit: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("recommendedAction") !== "post_subsequent_credit") return;
      const posted = await postAction(context, "postSubsequentCredit", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (posted) MessageBox.information(text("creditPosted"));
    },
    prepareSupplierContact: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      const draft = await postAction(context, "prepareSupplierContact", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (draft) MessageBox.information(text("draftStored", [draft.emailDraftTo, draft.emailDraftBody]));
    },
    dismissInvestigation: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      const reason = new TextArea({ width: "100%", rows: 4, placeholder: text("dismissPlaceholder") });
      const dialog = new Dialog({
        title: text("dismiss"),
        contentWidth: "24rem",
        content: reason,
        beginButton: new Button({
          text: text("ok"),
          type: "Emphasized",
          press: async function () {
            const value = reason.getValue().trim();
            if (!value) {
              MessageBox.error(text("dismissReasonRequired"));
              return;
            }
            dialog.close();
            await postAction(context, "dismissInvestigation", {
              investigationId: context.getProperty("ID"),
              actor: "local.reviewer",
              reason: value,
            });
          },
        }),
        endButton: new Button({
          text: text("cancel"),
          press: function () {
            dialog.close();
          },
        }),
        afterClose: function () {
          dialog.destroy();
        },
      });
      dialog.open();
    },
    askAdvisor: async function (context) {
      context = caseContext(context);
      const id = context && context.getProperty("ID");
      if (!id || context.getProperty("status") !== "awaiting_review") return;
      const thread = new VBox({ width: "100%", renderType: "Bare" });
      const input = new Input({ width: "100%", placeholder: text("askPlaceholder") });
      async function load() {
        thread.destroyItems();
        const response = await fetch("/workbench/Investigations(" + id + ")/messages?$orderby=askedAt");
        const body = await response.json();
        (body.value || []).forEach(function (message) {
          thread.addItem(
            new Text({
              text: (message.role === "advisor" ? text("advisor") : text("reviewer")) + ": " + message.text,
            }).addStyleClass("sapUiSmallMarginBottom"),
          );
        });
      }
      const dialog = new Dialog({
        title: text("askAdvisor"),
        contentWidth: "36rem",
        content: [
          new ScrollContainer({ height: "16rem", vertical: true, content: thread }),
          input,
        ],
        beginButton: new Button({
          text: text("send"),
          type: "Emphasized",
          press: async function () {
            const question = input.getValue().trim();
            if (!question) return;
            input.setValue("");
            const response = await fetch("/workbench/askInvestigation", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ID: id, question: question }),
            });
            if (!response.ok) {
              const body = await response.json().catch(function () {
                return {};
              });
              MessageBox.error((body.error && body.error.message) || text("actionRejected"));
              return;
            }
            await load();
            await context.requestSideEffects(["recommendedAction"]);
          },
        }),
        endButton: new Button({
          text: text("cancel"),
          press: function () {
            dialog.close();
          },
        }),
        afterClose: function () {
          dialog.destroy();
        },
      });
      await load();
      dialog.open();
    },
    retryInvestigation: async function (context) {
      context = caseContext(context);
      const id = context && context.getProperty("ID");
      if (!id || context.getProperty("status") !== "investigation_failed") return;
      await fetch("/workbench/retryInvestigation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ID: id }),
      });
      await context.requestSideEffects(["status", "paymentBlockingReason", "outcome", "closedAt"]);
    },
  };
});
