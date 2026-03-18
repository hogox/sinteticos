import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, "artifacts");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = Number(process.env.PORT || 8787);
const DEFAULT_RUN_TIMEOUT_MS = 25000;
const DEFAULT_SURFACE_TIMEOUT_MS = 8000;
const DEFAULT_FIGMA_INTERACTIVE_WAIT_MS = 1200;
const DEFAULT_INITIAL_WAIT_MS = 1200;
const DEFAULT_PAGE_ACTION_TIMEOUT_MS = 3500;
const DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS = 12000;
const DEFAULT_GOTO_TIMEOUT_MS = 20000;
const DEFAULT_STARTUP_GRACE_MS = 0;
const VISUAL_FRAME_DETECTION_TIMEOUT_MS = 1800;
const DEFAULT_BLIND_WAKE_POINTS = [
  { x: 0.5, y: 0.52, label: "center" },
  { x: 0.5, y: 0.8, label: "lower-center" },
  { x: 0.5, y: 0.24, label: "upper-center" },
  { x: 0.28, y: 0.52, label: "left-mid" },
  { x: 0.72, y: 0.52, label: "right-mid" }
];

const execFile = promisify(execFileCallback);

export {
  PROJECT_ROOT,
  __dirname,
  DATA_DIR,
  ARTIFACTS_DIR,
  STATE_FILE,
  PORT,
  DEFAULT_RUN_TIMEOUT_MS,
  DEFAULT_SURFACE_TIMEOUT_MS,
  DEFAULT_FIGMA_INTERACTIVE_WAIT_MS,
  DEFAULT_INITIAL_WAIT_MS,
  DEFAULT_PAGE_ACTION_TIMEOUT_MS,
  DEFAULT_PAGE_NAVIGATION_TIMEOUT_MS,
  DEFAULT_GOTO_TIMEOUT_MS,
  DEFAULT_STARTUP_GRACE_MS,
  VISUAL_FRAME_DETECTION_TIMEOUT_MS,
  DEFAULT_BLIND_WAKE_POINTS,
  execFile
};
