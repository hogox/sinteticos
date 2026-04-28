import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { PORT } from "./config.mjs";
import { ensurePaths, ensureState, readState, writeState, readJson, serveFile, sendJson } from "./persistence.mjs";
import { uid } from "./utils.mjs";
import { safeExecuteRun, getPlaywright } from "./runner.mjs";
import { buildInitialState } from "../shared/seed-data.js";
import { createRouteHandler } from "./routes.mjs";

await ensurePaths();
await ensureState(() => buildInitialState(uid));

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in Sinteticos Lab:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in Sinteticos Lab:", reason);
});

const handler = createRouteHandler({
  readState,
  writeState,
  readJson,
  serveFile,
  sendJson,
  uid,
  safeExecuteRun,
  getPlaywright,
  buildInitialState: () => buildInitialState(uid)
});

const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log(`Sinteticos Lab running on http://localhost:${PORT}`);
});
