import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { acquireWebR, releaseWebR, datasetMap } from "../webRInstance.js";
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

export const teamShootingStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(`
      tmp <- dplyr::bind_rows(${allFilesExpr()})
      team_shooting_stats(tmp)
    `);
    return ok(res, await result.toJs(), "team shooting stats");
  } catch (err) {
    return fail(res, err.message, "team shooting stats failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const playerShootingStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      player_shooting_stats(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "player shooting stats");
  } catch (err) {
    return fail(res, err.message, "player shooting stats failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const teamPassAccuracy = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      pass_accuracy(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "pass accuracy");
  } catch (err) {
    return fail(res, err.message, "pass accuracy failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const topPassers = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      top_passers(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "top passers");
  } catch (err) {
    return fail(res, err.message, "top passers failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const shotMap = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      shot_map(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "shot map");
  } catch (err) {
    return fail(res, err.message, "shot map failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const dribbleStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      dribble_stats(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "dribble stats");
  } catch (err) {
    return fail(res, err.message, "dribble stats failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const allTeamsOverview = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(`
      tmp <- dplyr::bind_rows(${allFilesExpr()})
      all_teams_overview(tmp)
    `);
    return ok(res, await result.toJs(), "all teams overview");
  } catch (err) {
    return fail(res, err.message, "all teams overview failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const teamOverview = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      team_overview(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "team overview");
  } catch (err) {
    return fail(res, err.message, "team overview failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};

export const pressurePerformance = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const file = datasetMap[req.params.team];
    if (!file) return fail(res, null, "team not found", 404);
    const result = await shelter.evalR(`
      tmp <- readRDS("${rdsPath(file)}")
      pressure_performance(tmp, ${JSON.stringify(req.params.team)})
    `);
    return ok(res, await result.toJs(), "pressure performance");
  } catch (err) {
    return fail(res, err.message, "pressure performance failed", 500);
  } finally {
    await shelter.purge();
    releaseWebR();
  }
};
