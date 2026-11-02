import cds from "@sap/cds";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { registerSimulatedEvents, resumeReceivedRows } from "./events.ts";
import { registerRetry } from "./investigation.ts";

const workbenchRoot = path.resolve("app/workbench/webapp");

cds.on("bootstrap", (app) => {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: "simulated-s4" });
  });
  app.get("/workbench-ui", (_req, res) => {
    res.redirect("/workbench-ui/index.html");
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
  registerSimulatedEvents(app as unknown as { post(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void });
  registerRetry();
  resumeReceivedRows();
});
