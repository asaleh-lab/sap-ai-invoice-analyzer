---
status: accepted
---

# English and German come from CAP and UI5 text bundles

The workbench is shown in English and German. Texts live in the bundles those stacks already load. There is no second translation layer and no language menu in the app.

CAP annotation labels use `{i18n>…}` and the files under `app/workbench/_i18n/`. The default bundle is English. `i18n_en.properties` and `i18n_de.properties` are the two locales named in `cds.i18n`. CAP fills the OData labels from the request language.

UI5 screen texts use `app/workbench/webapp/i18n/`, declared on `sap.app/i18n` and as the `i18n` resource model. The same two locales are listed, with English as the fallback. UI5 asks for `i18n_en.properties` when the locale is English, so that file is present as well as `i18n.properties`.

The list report is a nested Fiori elements component, so it does not inherit the app component's `i18n` model. The dashboard fragment gets that model set on the view. Without that, `{i18n>…}` bindings render blank while other models still show values.

The local sandbox has one default user and no language list. Language is chosen with `sap-ui-language` on the sandbox URL, for example `http://localhost:4004/workbench-ui/test/flpSandbox.html?sap-ui-language=de`. The sandbox must not pin `data-sap-ui-language`, or that parameter is ignored. `/workbench-ui/` is already the `webapp` folder, so the URL does not include `webapp` again.

Stored codes such as `awaiting_review` stay codes. The publisher page is plain HTML and is outside these bundles.
