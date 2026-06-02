import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { webR, ready, datasetMap } from "../webRInstance.js";
import { ok, fail } from "../helpers/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, "..", "data");
const DATA_WEBR = "/home/web_user/data";

function rdsPath(file) {
  return `${DATA_WEBR}/${file}`;
}

function allFilesExpr() {
  return Object.values(datasetMap)
    .map(f => `readRDS("${rdsPath(f)}")`)
    .join(", ");
}

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

// Shooting summary for every team in the dataset
export const teamShootingStats = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const result = await shelter.evalR(`
      tmp <- dplyr::bind_rows(${allFilesExpr()})
      team_shooting_stats(tmp)
    `);
    const data = await result.toJs();
    return ok(res, data, "team shooting stats");
  } catch (err) {
    return fail(res, err.message, "team shooting stats failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Shooting breakdown by player for a single team  (:team in URL)
export const playerShootingStats = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      player_shooting_stats(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "player shooting stats");
  } catch (err) {
    return fail(res, err.message, "player shooting stats failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Pass accuracy summary for a team
export const teamPassAccuracy = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      pass_accuracy(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "pass accuracy");
  } catch (err) {
    return fail(res, err.message, "pass accuracy failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Top 10 passers by volume for a team
export const topPassers = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      top_passers(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "top passers");
  } catch (err) {
    return fail(res, err.message, "top passers failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Shot locations + xG for pitch map visualisation
export const shotMap = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      shot_map(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "shot map");
  } catch (err) {
    return fail(res, err.message, "shot map failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Dribble success rate by player for a team
export const dribbleStats = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      dribble_stats(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "dribble stats");
  } catch (err) {
    return fail(res, err.message, "dribble stats failed", 500);
  } finally {
    await shelter.purge();
  }
};

// Multi-team comparison — only full-season datasets, no partial opponent data
export const allTeamsOverview = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const result = await shelter.evalR(`
      tmp <- dplyr::bind_rows(${allFilesExpr()})
      all_teams_overview(tmp)
    `);
    const data = await result.toJs();
    return ok(res, data, "all teams overview");
  } catch (err) {
    return fail(res, err.message, "all teams overview failed", 500);
  } finally {
    await shelter.purge();
  }
};

// High-level performance summary for a team
export const teamOverview = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      team_overview(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "team overview");
  } catch (err) {
    return fail(res, err.message, "team overview failed", 500);
  } finally {
    await shelter.purge();
  }
};

// How often each action type is performed under pressure for a team
export const pressurePerformance = async (req, res) => {
  const shelter = await new webR.Shelter();
  try {
    await ready;
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      pressure_performance(tmp, ${JSON.stringify(req.params.team)})
    `);
    const data = await result.toJs();
    return ok(res, data, "pressure performance");
  } catch (err) {
    return fail(res, err.message, "pressure performance failed", 500);
  } finally {
    await shelter.purge();
  }
};
