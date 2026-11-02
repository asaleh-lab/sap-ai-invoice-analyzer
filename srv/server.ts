import cds from "@sap/cds";

cds.on("bootstrap", (app) => {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: "simulated-s4" });
  });
});
