import cds from "@sap/cds";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { registerSimulatedEvents, resumeReceivedRows } from "./events.ts";
import { registerPublisher } from "./publisher.ts";
import { registerHumanActions } from "./actions.ts";
import { registerRetry } from "./investigation.ts";
import { registerWorkbenchSummary } from "./summary.ts";

const workbenchRoot = path.resolve("app/workbench/webapp");

cds.on("bootstrap", (app) => {
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "unload=*");
    next();
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: "simulated-s4" });
  });
  app.get(/\/appconfig\/fioriSandboxConfig\.json$/, (_req, res) => {
    res.json({});
  });
  app.get("/workbench-ui", (_req, res) => {
    res.redirect("/workbench-ui/test/flpSandbox.html");
  });
  app.get("/workbench-ui/*file", (req, res) => {
    const relative = decodeURIComponent(req.path.replace(/^\/workbench-ui\/?/, ""));
    const file = path.resolve(workbenchRoot, relative);
    if (!file.startsWith(workbenchRoot) || !existsSync(file) || !statSync(file).isFile()) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Workbench file was not found." } });
      return;
    }
    res.type(path.extname(file));
    createReadStream(file).on("data", (chunk: string | Buffer) => {
      res.write(chunk);
    }).on("end", () => {
      res.end();
    });
  });
  app.get("/publisher", (_req, res) => {
    res.type("html");
    createReadStream(path.resolve("app/publisher/index.html"))
      .on("data", (chunk: string | Buffer) => {
        res.write(chunk);
      })
      .on("end", () => {
        res.end();
      });
  });
  const routes = app as unknown as {
    post(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
  };
  registerSimulatedEvents(routes);
  registerPublisher(routes);
  registerRetry();
  registerHumanActions();
  registerWorkbenchSummary();
  resumeReceivedRows();
});
