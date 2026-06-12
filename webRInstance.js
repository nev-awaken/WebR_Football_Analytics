import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
  mountDataDir,
  mountModelsDir,
} from "./helpers/webrSetup.js";
import { logStage } from "./helpers/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["teamStats.R", "matchOutcome.R"];
const R_DIR     = "r";

const dataDir   = path.join(__dirname, "data");
const RDS_FILES = fs.readdirSync(dataDir).filter(f => /^\d+_\d+_.+\.rds$/.test(f));

// Trained match-outcome model artifact (produced offline by r/matchOutcomeTrainer.R).
const MODELS_DIR             = path.join(__dirname, "models");
const MATCH_OUTCOME_RDS      = "matchOutcome.rds";
const MATCH_OUTCOME_RDS_PATH = path.join(MODELS_DIR, MATCH_OUTCOME_RDS);

function readMatchOutcomeMeta() {
  const p = path.join(MODELS_DIR, "matchOutcome.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
// Metadata sidecar for the trained model (null until a model is trained).
export const matchOutcomeMeta = readMatchOutcomeMeta();

let _matchOutcomeLoaded = false;
// Whether a trained match-outcome model is currently loaded into MATCH_OUTCOME_MODEL.
export function matchOutcomeModelLoaded() { return _matchOutcomeLoaded; }

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
const R_MAX_VSIZE_MB         = parseInt(process.env.R_MAX_VSIZE_MB || '512');

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
  await mountModelsDir(instance, __dirname);
  const teams = Object.keys(datasetMap).map(t => `"${t.replace(/"/g, '\\"')}"`).join(", ");
  await instance.evalRVoid(`dataset_teams <- c(${teams})`);
  await preloadDatasets(instance);
  logStage("after preload");
  await loadMatchOutcomeModel(instance);
  // Guardrail: cap R's vector heap so a pathological request errors (clean,
  // catchable, instance survives) instead of permanently growing the WASM heap
  // — which never shrinks — to a new high-water mark until the next recycle.
  // The cap covers resident data (TEAM_DATA) + request transients, so it must
  // sit comfortably above the heaviest legitimate request's peak. Set AFTER
  // preload so startup loading is never throttled by it. The --max-vsize RArg
  // is ignored by the WASM build; only this runtime setter is honoured
  // (docs/memory-optimization-research.md §8.2).
  await instance.evalRVoid(`invisible(mem.maxVSize(${R_MAX_VSIZE_MB}))`);
  console.log(`[guardrail] R vector heap capped at ${R_MAX_VSIZE_MB}MB (R_MAX_VSIZE_MB to override)`);
  logStage("ready");
  console.log("webR ready");
  return instance;
}

// Load the trained match-outcome model into the R global MATCH_OUTCOME_MODEL, if
// the artifact exists. Re-runs on every recycle (lives in initWebR). A missing
// artifact is not an error — the endpoints return a clear 503 until one is trained.
async function loadMatchOutcomeModel(webR) {
  if (!fs.existsSync(MATCH_OUTCOME_RDS_PATH)) {
    _matchOutcomeLoaded = false;
    console.warn(`[match-outcome] no trained model at models/${MATCH_OUTCOME_RDS} — run r/matchOutcomeTrainer.R`);
    return;
  }
  await webR.evalRVoid(`MATCH_OUTCOME_MODEL <- readRDS("/home/web_user/models/${MATCH_OUTCOME_RDS}")`);
  _matchOutcomeLoaded = true;
  console.log("[match-outcome] trained model loaded");
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
  // _webR === null means a previous recycle closed the instance but reinit
  // failed — always retry, skipping cooldown and threshold (the heap is gone,
  // so RSS is low and would never re-trigger a threshold-based recycle).
  const dead = _webR === null;
  if (!dead) {
    if (Date.now() - _lastRecycleAt < RECYCLE_COOLDOWN_MS) return;
    const currentMB = process.memoryUsage().rss / 1e6;
    if (currentMB < _recycleThresholdMB) return;
  }

  _recycling     = true;
  _lastRecycleAt = Date.now();

  // Gate: new requests queue up while we recycle
  closeGate();

  if (dead) {
    console.log("[recycle] retrying init after previous failure");
  } else {
    console.log(`[recycle] triggered — rss=${(process.memoryUsage().rss / 1e6).toFixed(0)}MB threshold=${_recycleThresholdMB.toFixed(0)}MB — waiting for ${_activeRequests} active request(s) to drain`);

    // Drain in-flight requests
    while (_activeRequests > 0) {
      await new Promise(r => setTimeout(r, 20));
    }

    console.log("[recycle] draining complete — closing webR");
    _webR.close();
    _webR = null;
    logStage("post-close");
  }

  const start = Date.now();
  try {
    _webR = await initWebR();
  } catch (err) {
    // Reinit failed with the old instance already closed — nothing can be
    // served. Open the gate so queued/new requests fail fast (via the rejected
    // _ready) instead of hanging forever, and clear _recycling so the next
    // monitor tick retries via the `dead` path above.
    console.error(`[recycle] reinit FAILED: ${err.message} — requests will error until a retry succeeds`);
    _ready = Promise.reject(err);
    _ready.catch(() => {}); // prevent unhandledRejection before the next acquire
    _recycling = false;
    openGate();
    return;
  }
  _ready = Promise.resolve();

  const newBaselineMB = process.memoryUsage().rss / 1e6;
  _recycleThresholdMB = RECYCLE_THRESHOLD_HARD ?? (newBaselineMB + RECYCLE_HEADROOM_MB);
  _recycling = false;

  console.log(`[recycle] complete in ${((Date.now() - start) / 1000).toFixed(1)}s — new threshold ${_recycleThresholdMB.toFixed(0)}MB`);

  // Open gate — queued requests proceed with new instance
  openGate();
}
