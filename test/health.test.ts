import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("GET /health reports simulated S/4 mode", async () => {
  const port = "4011";
  const child = spawn(process.execPath, ["node_modules/@sap/cds/bin/serve.js", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port },
  });
  let logs = "";
  child.stdout.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });

  try {
    const body = await waitForHealth(port, () => logs);
    assert.deepEqual(body, { status: "ok", mode: "simulated-s4" });
  } finally {
    child.kill();
  }
});

async function waitForHealth(port: string, logs: () => string): Promise<{ status: string; mode: string }> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return (await response.json()) as { status: string; mode: string };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`health did not become ready\n${logs()}\n${String(lastError)}`);
}
