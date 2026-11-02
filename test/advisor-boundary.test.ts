import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const advisorDir = path.join(import.meta.dirname, "..", "advisor");

test("advisor does not import @sap/cds", async () => {
  const files = await readdir(advisorDir);
  const sources = await Promise.all(
    files
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFile(path.join(advisorDir, name), "utf8")),
  );
  const joined = sources.join("\n");
  assert.equal(joined.includes("@sap/cds"), false);
  assert.equal(/from\s+["']@sap\/cds["']/.test(joined), false);
});
