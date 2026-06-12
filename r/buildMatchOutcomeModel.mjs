// One-off generator for the trained match-outcome model artifact.
//
// DOMAIN: football match-outcome prediction.
//
// Normally you train this model in local R via r/matchOutcomeTrainer.R. This
// Node script does the same thing through WebR so the artifact can be produced
// without a native R install. It reuses train_match_outcome_model() from the
// trainer (sourced with match_outcome_no_run=TRUE so the trainer's local-run
// block is skipped), feeding it a match table built from the data/ sidecars.
//
//     node r/buildMatchOutcomeModel.mjs
//
// Output: models/matchOutcome.rds  +  models/matchOutcome.json

import { WebR } from "webr";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const root       = path.join(__dirname, "..");
const dataDir    = path.join(root, "data");
const modelsDir  = path.join(root, "models");
fs.mkdirSync(modelsDir, { recursive: true });

// ---- Build a unique match table from the data/ JSON files -----------------
// Prefer a full-season results file (results_*.json from seasonResultsGenerator.R):
// it covers the whole league, already home/away oriented, one row per match.
// Otherwise fall back to the per-team event sidecars, where a head-to-head match
// appears in both files (dedupe on match_id) and the score is stored "home-away".
const allJson      = fs.readdirSync(dataDir).filter(f => /\.json$/.test(f));
const resultsFiles = allJson.filter(f => /^results_.*\.json$/.test(f));
if (!allJson.length) {
  console.error("No data files found in data/ — generate datasets first.");
  process.exit(1);
}

const byId = new Map();
if (resultsFiles.length) {
  for (const f of resultsFiles) {
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
    for (const mt of meta.matches) {
      if (byId.has(mt.match_id)) continue;
      byId.set(mt.match_id, { home: mt.home_team, away: mt.away_team, hg: mt.home_goals, ag: mt.away_goals });
    }
  }
} else {
  for (const f of allJson) {
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
    for (const mt of meta.matches) {
      if (byId.has(mt.match_id)) continue;
      const [hg, ag] = mt.score.split("-").map(s => parseInt(s, 10));
      const home = mt.is_home ? meta.team : mt.opponent;
      const away = mt.is_home ? mt.opponent : meta.team;
      byId.set(mt.match_id, { home, away, hg, ag });
    }
  }
}
const matches = [...byId.values()];
const metaFile = resultsFiles.length ? resultsFiles[0] : allJson[0];
console.log(`Built ${matches.length} unique matches`);

// ---- Fit the model inside WebR --------------------------------------------
const webR = new WebR();
await webR.init();
await webR.FS.mkdir("/home/web_user/models");
await webR.FS.mount("NODEFS", { root: modelsDir }, "/home/web_user/models");

// Source the trainer (base-R train_match_outcome_model), skipping its local run
const trainerSrc = fs.readFileSync(path.join(__dirname, "matchOutcomeTrainer.R"), "utf8");
await webR.FS.writeFile("/home/web_user/matchOutcomeTrainer.R", new TextEncoder().encode(trainerSrc));
await webR.evalRVoid(`options(match_outcome_no_run = TRUE); source("/home/web_user/matchOutcomeTrainer.R", local = globalenv())`);

const esc  = s => JSON.stringify(s);
const vecS = matches.map(m => esc(m.home)).join(",");
const vecA = matches.map(m => esc(m.away)).join(",");
const vecH = matches.map(m => m.hg).join(",");
const vecG = matches.map(m => m.ag).join(",");

await webR.evalRVoid(
  `matches <- data.frame(home_team=c(${vecS}), away_team=c(${vecA}), ` +
  `home_goals=c(${vecH}), away_goals=c(${vecG}), stringsAsFactors=FALSE)`
);
await webR.evalRVoid(
  `MATCH_OUTCOME_MODEL <- train_match_outcome_model(matches); ` +
  `saveRDS(MATCH_OUTCOME_MODEL, "/home/web_user/models/matchOutcome.rds")`
);

// Pull scalar metrics back for the metadata sidecar
async function rnum(expr) {
  const r = await webR.evalR(expr);
  const j = await r.toJs();
  return Array.isArray(j.values) ? j.values[0] : j;
}

const one = JSON.parse(fs.readFileSync(path.join(dataDir, metaFile), "utf8"));
const sidecar = {
  model:       "match-outcome-prediction",
  method:      "Poisson attack/defence ratings",
  trained_at:  new Date().toISOString().replace("T", " ").slice(0, 19),
  competition: one.competition,
  season:      one.season,
  n_matches:   matches.length,
  n_teams:     await rnum(`length(MATCH_OUTCOME_MODEL$teams)`),
  test: {
    outcome_accuracy: await rnum(`MATCH_OUTCOME_MODEL$test$outcome_accuracy`),
    mean_abs_error:   await rnum(`MATCH_OUTCOME_MODEL$test$mean_abs_error`),
    log_likelihood:   await rnum(`MATCH_OUTCOME_MODEL$test$log_likelihood`),
    n_test:           await rnum(`MATCH_OUTCOME_MODEL$test$n_test`),
  },
};
fs.writeFileSync(path.join(modelsDir, "matchOutcome.json"), JSON.stringify(sidecar, null, 2));

await webR.close();
console.log("Saved models/matchOutcome.rds + models/matchOutcome.json");
console.log(`Back-test outcome accuracy: ${sidecar.test.outcome_accuracy}%  |  MAE: ${sidecar.test.mean_abs_error} goals`);
