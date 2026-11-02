import cds from "@sap/cds";
import type { IncomingMessage, ServerResponse } from "node:http";
import { registerSimulatedEvents, resumeReceivedRows } from "./events.ts";

cds.on("bootstrap", (app) => {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", mode: "simulated-s4" });
  });
  registerSimulatedEvents(app as unknown as { post(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void });
  resumeReceivedRows();
});
