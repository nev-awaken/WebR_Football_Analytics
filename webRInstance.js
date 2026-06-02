import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
  mountDataDir,
} from "./helpers/webrSetup.js";
import { logStage } from "./helpers/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["teamStats.R"];
const R_DIR     = "r";

const dataDir   = path.join(__dirname, "data");
const RDS_FILES = fs.readdirSync(dataDir).filter(f => /^\d+_\d+_.+\.rds$/.test(f));

if (RDS_FILES.length === 0) console.warn("No datasets found in data/ — add an RDS via the generator");

export const datasetMap = Object.fromEntries(
  RDS_FILES.flatMap(file => {
    const jsonPath = path.join(dataDir, file.replace(".rds", ".json"));
    if (!fs.existsSync(jsonPath)) return [];
    const team = JSON.parse(fs.readFileSync(jsonPath, "utf8")).team;
    return [[team, file]];
  })
);

const RECYCLE_COOLDOWN_MS  = 5 * 60 * 1000;
const RECYCLE_HEADROOM_MB  = parseInt(process.env.RECYCLE_HEADROOM_MB || '200');

// Mutable instance state
let _webR              = null;
let _ready             = null;
let _activeRequests    = 0;
let _recycling         = false;
let _lastRecycleAt     = 0;
let _gateResolve       = null;
let _gate              = Promise.resolve();
let _recycleThresholdMB = Infinity; // set after first init completes

function closeGate() {
  _gate = new Promise(resolve => { _gateResolve = resolve; });
}

function openGate() {
  if (_gateResolve) { _gateResolve(); _gateResolve = null; }
}

async function initWebR() {
  const instance = new WebR();
  logStage("boot");
  await instance.init();
  logStage("after init");
  await mountPackageLibrary(instance, __dirname);
  await ensurePackages(instance, PACKAGES, __dirname);
  logStage("after pkgs");
  await loadRScripts(instance, R_SCRIPTS, path.join(__dirname, R_DIR));
  await mountDataDir(instance, __dirname);
  const teams = Object.keys(datasetMap).map(t => `"${t.replace(/"/g, '\\"')}"`).join(", ");
  await instance.evalRVoid(`dataset_teams <- c(${teams})`);
  logStage("ready");
  console.log("webR ready");
  return instance;
}

// Startup
_ready = (async () => {
  _webR = await initWebR();
  const baselineMB = process.memoryUsage().rss / 1e6;
  _recycleThresholdMB = baselineMB + RECYCLE_HEADROOM_MB;
  console.log(`[recycle] threshold set to ${_recycleThresholdMB.toFixed(0)}MB (baseline ${baselineMB.toFixed(0)}MB + ${RECYCLE_HEADROOM_MB}MB headroom)`);
})();

// Acquire the current webR instance for a request.
// Waits if a recycle is in progress.
export async function acquireWebR() {
  await _gate;
  await _ready;
  await _gate; // re-check after all awaits to close the race window
  _activeRequests++;
  return _webR;
}

// Release after request completes (call after shelter.purge()).
export function releaseWebR() {
  _activeRequests--;
}

// Close the current WebR instance, free the WASM heap, and reinitialise.
// In-flight requests complete on the old instance before it is closed.
export async function recycleWebR() {
  if (_recycling) return;
  if (Date.now() - _lastRecycleAt < RECYCLE_COOLDOWN_MS) return;
  const currentMB = process.memoryUsage().rss / 1e6;
  if (currentMB < _recycleThresholdMB) return;

  _recycling     = true;
  _lastRecycleAt = Date.now();

  // Gate: new requests queue up while we recycle
  closeGate();

  console.log(`[recycle] triggered — rss=${currentMB.toFixed(0)}MB threshold=${_recycleThresholdMB.toFixed(0)}MB — waiting for ${_activeRequests} active request(s) to drain`);

  // Drain in-flight requests
  while (_activeRequests > 0) {
    await new Promise(r => setTimeout(r, 20));
  }

  console.log("[recycle] draining complete — closing webR");
  _webR.close();
  logStage("post-close");

  const start = Date.now();
  _webR   = await initWebR();
  _ready  = Promise.resolve();
  _recycling = false;

  console.log(`[recycle] complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);

  // Open gate — queued requests proceed with new instance
  openGate();
}
