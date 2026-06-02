import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { acquireWebR, releaseWebR, gcWebR, datasetMap } from "../webRInstance.js";
import { ok, fail } from "../helpers/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, "..", "data");

// Datasets are preloaded once into the R list `TEAM_DATA` at startup (see
// preloadDatasets in webRInstance.js). Controllers read from TEAM_DATA[["<team>"]]
// instead of readRDS-ing per request — analysis stays fully live, just much faster.

// Returns metadata for all available datasets (reads JSON sidecars — no R needed)
export const getDatasets = (req, res) => {
  try {
    const datasets = fs.readdirSync(DATA_DIR)
      .filter(f => /^\d+_\d+_.+\.json$/.test(f))
      .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")));
    return ok(res, datasets, "datasets");
  } catch (err) {
    return fail(res, err.message, "datasets failed", 500);
  }
};

export const teamShootingStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(`
      local({
        tmp <- combine_datasets(TEAM_DATA)
        team_shooting_stats(tmp)
      })
    `);
    return ok(res, await result.toJs(), "team shooting stats");
  } catch (err) {
    return fail(res, err.message, "team shooting stats failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const playerShootingStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `player_shooting_stats(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "player shooting stats");
  } catch (err) {
    return fail(res, err.message, "player shooting stats failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const teamPassAccuracy = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `pass_accuracy(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "pass accuracy");
  } catch (err) {
    return fail(res, err.message, "pass accuracy failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const topPassers = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `top_passers(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "top passers");
  } catch (err) {
    return fail(res, err.message, "top passers failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const shotMap = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `shot_map(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "shot map");
  } catch (err) {
    return fail(res, err.message, "shot map failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const dribbleStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `dribble_stats(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "dribble stats");
  } catch (err) {
    return fail(res, err.message, "dribble stats failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const allTeamsOverview = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(`
      local({
        tmp <- combine_datasets(TEAM_DATA)
        all_teams_overview(tmp)
      })
    `);
    return ok(res, await result.toJs(), "all teams overview");
  } catch (err) {
    return fail(res, err.message, "all teams overview failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const teamOverview = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `team_overview(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "team overview");
  } catch (err) {
    return fail(res, err.message, "team overview failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

export const pressurePerformance = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const team = req.params.team;
    if (!datasetMap[team]) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(
      `pressure_performance(TEAM_DATA[[${JSON.stringify(team)}]], ${JSON.stringify(team)})`
    );
    return ok(res, await result.toJs(), "pressure performance");
  } catch (err) {
    return fail(res, err.message, "pressure performance failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};
