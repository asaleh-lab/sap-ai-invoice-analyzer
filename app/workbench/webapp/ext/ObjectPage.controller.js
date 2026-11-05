sap.ui.define(
  ["sap/ui/core/mvc/ControllerExtension", "sap/m/OverflowToolbarLayoutData", "sap/m/MessageBox", "sap/m/Dialog", "sap/m/Button", "sap/m/TextArea", "sap/m/VBox", "sap/m/Text", "sap/m/Input", "sap/m/ScrollContainer"],
  function (ControllerExtension, OverflowToolbarLayoutData, MessageBox, Dialog, Button, TextArea, VBox, Text, Input, ScrollContainer) {
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

  const actionIcons = {
    askAdvisor: "sap-icon://discussion-2",
    retryInvestigation: "sap-icon://refresh",
    releasePaymentBlock: "sap-icon://unlocked",
    postSubsequentCredit: "sap-icon://expense-report",
    prepareSupplierContact: "sap-icon://email",
    dismissInvestigation: "sap-icon://decline",
  };

  function pinAskAdvisor(view) {
    Object.keys(actionIcons).forEach(function (name) {
      const button = view.byId("fe::CustomAction::" + name);
      if (button && button.setIcon) button.setIcon(actionIcons[name]);
    });
    const retry = view.byId("fe::CustomAction::retryInvestigation");
    if (retry && !retry.data("pinned")) {
      retry.data("pinned", "1");
      retry.setLayoutData(new OverflowToolbarLayoutData({ priority: "NeverOverflow" }));
      const bar = retry.getParent();
      if (bar && bar.indexOfContent && bar.indexOfContent(retry) > 0) {
        bar.removeContent(retry);
        bar.insertContent(retry, 0);
      }
    }
  }

  return ControllerExtension.extend("workbench.ext.ObjectPage", {
    override: {
      onAfterRendering: function () {
        pinAskAdvisor(this.base.getView());
      },
    },
    releasePaymentBlock: async function (context) {
      context = caseContext(context);
      if (!context) return;
      await postAction(context, "releasePaymentBlock", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
    },
    postSubsequentCredit: async function (context) {
      context = caseContext(context);
      if (!context) return;
      const posted = await postAction(context, "postSubsequentCredit", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (posted) MessageBox.information(text("creditPosted"));
    },
    prepareSupplierContact: async function (context) {
      context = caseContext(context);
      if (!context) return;
      const draft = await postAction(context, "prepareSupplierContact", {
        investigationId: context.getProperty("ID"),
        actor: "local.reviewer",
      });
      if (draft) MessageBox.information(text("emailSent"));
    },
    dismissInvestigation: async function (context) {
      context = caseContext(context);
      if (!context) return;
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
      if (!id) return;
      const thread = new VBox({ width: "100%", renderType: "Bare" });
      const scroll = new ScrollContainer({
        width: "100%",
        height: "28rem",
        vertical: true,
        horizontal: false,
        content: thread,
      }).addStyleClass("advisorChatThread");
      const input = new Input({ width: "100%", placeholder: text("askPlaceholder") });
      const advisorLabel = text("advisor");
      const reviewerLabel = text("reviewer");
      function bubble(role, body) {
        const fromAdvisor = role === "advisor";
        return new VBox({
          items: [
            new Text({ text: fromAdvisor ? advisorLabel : reviewerLabel }).addStyleClass("advisorChatRole"),
            new Text({ text: body, wrapping: true }),
          ],
        }).addStyleClass(fromAdvisor ? "advisorChatModel" : "advisorChatUser");
      }
      function showLatest() {
        setTimeout(function () {
          const dom = scroll.getDomRef("scroll") || scroll.getDomRef();
          if (dom) dom.scrollTop = dom.scrollHeight;
        }, 0);
      }
      async function load() {
        thread.destroyItems();
        const response = await fetch("/workbench/Investigations(" + id + ")/messages?$orderby=askedAt");
        const body = await response.json();
        (body.value || []).forEach(function (message) {
          thread.addItem(bubble(message.role, message.text));
        });
        showLatest();
      }
      async function send() {
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
      }
      input.attachSubmit(send);
      const dialog = new Dialog({
        title: text("askAdvisor"),
        contentWidth: "26rem",
        verticalScrolling: false,
        horizontalScrolling: false,
        content: [
          new VBox({
            width: "100%",
            height: "100%",
            renderType: "Bare",
            items: [scroll, input],
          }).addStyleClass("advisorChatBody"),
        ],
        beginButton: new Button({
          text: text("send"),
          type: "Emphasized",
          press: send,
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
      dialog.addStyleClass("advisorChatPane");
      dialog.attachAfterOpen(function () {
        if (dialog.oPopup && dialog.oPopup.setModal) dialog.oPopup.setModal(false);
        showLatest();
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
  });
});
