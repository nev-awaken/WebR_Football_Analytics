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
const RECYCLE_HEADROOM_MB    = parseInt(process.env.RECYCLE_HEADROOM_MB || '200');
const RECYCLE_THRESHOLD_HARD = process.env.RECYCLE_THRESHOLD_MB ? parseInt(process.env.RECYCLE_THRESHOLD_MB) : null;

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
  // NOTE: we deliberately do NOT set R_GC_MEM_GROW=0. Measured, it only lowers
  // the heap plateau by ~17MB but adds ~110ms (~6%) to every heavy request
  // because R then GCs aggressively mid-computation. The per-request gc(full=TRUE)
  // in gcWebR already keeps the plateau flat (~342MB, ~10MB drift over 30 heavy
  // requests) for only ~30ms/request — a far better trade. See
  // docs/memory-optimization-research.md.
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
  await preloadDatasets(instance);
  logStage("after preload");
  logStage("ready");
  console.log("webR ready");
  return instance;
}

// Preload every dataset once into a resident R list `TEAM_DATA`, keyed by team
// name. readRDS (xz decompress + unserialize) is ~90% of a request's time, so
// doing it once at startup instead of per-request makes the analysis endpoints
// ~5-10x faster. Peak memory is unchanged — the all-teams endpoints already force
// the heap to hold every dataset at once — only the idle baseline rises by the
// resident frames. The combined set for all-teams is built per-request from these
// in-memory frames (no decompress), so it stays transient. Re-runs on every
// recycle because it lives in initWebR.
async function preloadDatasets(webR) {
  await webR.evalRVoid("TEAM_DATA <- list()");
  for (const [team, file] of Object.entries(datasetMap)) {
    const key = team.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await webR.evalRVoid(`TEAM_DATA[["${key}"]] <- readRDS("/home/web_user/data/${file}")`);
  }
}

// Startup
_ready = (async () => {
  _webR = await initWebR();
  const baselineMB = process.memoryUsage().rss / 1e6;
  _recycleThresholdMB = RECYCLE_THRESHOLD_HARD ?? (baselineMB + RECYCLE_HEADROOM_MB);
  const thresholdSource = RECYCLE_THRESHOLD_HARD ? 'fixed override' : `baseline ${baselineMB.toFixed(0)}MB + ${RECYCLE_HEADROOM_MB}MB headroom`;
  console.log(`[recycle] threshold set to ${_recycleThresholdMB.toFixed(0)}MB (${thresholdSource})`);
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

// Force an R garbage collection. Call after shelter.purge() (while the instance
// is still acquired) so freed request temporaries return to dlmalloc's free list
// and get reused, instead of the WASM heap growing to a new high-water mark.
// This does NOT return memory to the OS (only recycleWebR can) — it keeps the
// heap from drifting upward so recycles stay rare. Never throws.
export async function gcWebR(webR) {
  try {
    await webR.evalRVoid("invisible(gc(full = TRUE))");
  } catch {
    /* gc is best-effort — a failure here must not break the request */
  }
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
  _webR  = await initWebR();
  _ready = Promise.resolve();

  const newBaselineMB = process.memoryUsage().rss / 1e6;
  _recycleThresholdMB = RECYCLE_THRESHOLD_HARD ?? (newBaselineMB + RECYCLE_HEADROOM_MB);
  _recycling = false;

  console.log(`[recycle] complete in ${((Date.now() - start) / 1000).toFixed(1)}s — new threshold ${_recycleThresholdMB.toFixed(0)}MB`);

  // Open gate — queued requests proceed with new instance
  openGate();
}
