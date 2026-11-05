sap.ui.define(
  ["sap/m/MessageBox", "sap/m/Dialog", "sap/m/Button", "sap/m/TextArea", "sap/m/VBox", "sap/m/Text", "sap/m/Input", "sap/m/ScrollContainer"],
  function (MessageBox, Dialog, Button, TextArea, VBox, Text, Input, ScrollContainer) {
  "use strict";
  async function text(key, args) {
    const component = Object.values(sap.ui.core.Component.registry.all()).find((entry) => {
      return entry.getMetadata && entry.getMetadata().getName() === "workbench.Component";
    });
    let bundle = component.getModel("i18n").getResourceBundle();
    if (bundle && typeof bundle.then === "function") bundle = await bundle;
    return bundle.getText(key, args);
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
      MessageBox.error((body.error && body.error.message) || (await text("actionRejected")));
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
      if (posted) MessageBox.information(await text("creditPosted"));
    },
    prepareSupplierContact: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      const draft = await postAction(context, "prepareSupplierContact", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (draft) MessageBox.information(await text("draftStored", [draft.emailDraftTo, draft.emailDraftBody]));
    },
    dismissInvestigation: async function (context) {
      context = caseContext(context);
      if (!context || context.getProperty("status") !== "awaiting_review") return;
      const reason = new TextArea({ width: "100%", rows: 4, placeholder: await text("dismissPlaceholder") });
      const dialog = new Dialog({
        title: await text("dismiss"),
        contentWidth: "24rem",
        content: reason,
        beginButton: new Button({
          text: await text("ok"),
          type: "Emphasized",
          press: async function () {
            const value = reason.getValue().trim();
            if (!value) {
              MessageBox.error(await text("dismissReasonRequired"));
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
          text: await text("cancel"),
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
      const input = new Input({ width: "100%", placeholder: await text("askPlaceholder") });
      const advisorLabel = await text("advisor");
      const reviewerLabel = await text("reviewer");
      const narrative = context.getProperty("narrative") || "";
      async function load() {
        thread.destroyItems();
        if (narrative) {
          thread.addItem(new Text({ text: advisorLabel + ": " + narrative }).addStyleClass("sapUiSmallMarginBottom"));
        }
        const response = await fetch("/workbench/Investigations(" + id + ")/messages?$orderby=askedAt");
        const body = await response.json();
        (body.value || []).forEach(function (message) {
          thread.addItem(
            new Text({
              text: (message.role === "advisor" ? advisorLabel : reviewerLabel) + ": " + message.text,
            }).addStyleClass("sapUiSmallMarginBottom"),
          );
        });
      }
      const dialog = new Dialog({
        title: await text("askAdvisor"),
        contentWidth: "36rem",
        content: [new ScrollContainer({ height: "16rem", vertical: true, content: thread }), input],
        beginButton: new Button({
          text: await text("send"),
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
              MessageBox.error((body.error && body.error.message) || (await text("actionRejected")));
              return;
            }
            const sent = await response.json();
            await load();
            if (sent.confirmationRequired) {
              thread.addItem(
                new Button({
                  text: "Send email to " + sent.emailTo,
                  press: async function () {
                    const confirmed = await fetch("/workbench/confirmSendEmail", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ ID: id }),
                    });
                    if (!confirmed.ok) {
                      const failure = await confirmed.json().catch(function () {
                        return {};
                      });
                      MessageBox.error((failure.error && failure.error.message) || (await text("actionRejected")));
                      return;
                    }
                    await load();
                    await context.requestSideEffects(["status", "outcome", "closedAt", "recommendedAction"]);
                  },
                }),
              );
            }
            await context.requestSideEffects(["recommendedAction"]);
          },
        }),
        endButton: new Button({
          text: await text("cancel"),
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
