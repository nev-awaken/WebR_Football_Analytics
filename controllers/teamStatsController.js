import { webR, ready } from "../webrInstance.js";
import { ok, fail } from "../helpers/response.js";

// Shooting summary for every team in the dataset
export const teamShootingStats = async (req, res) => {
  try {
    await ready;
    const result = await webR.evalR("team_shooting_stats(match_data)");
    return ok(res, await result.toJs(), "team shooting stats");
  } catch (err) {
    return fail(res, err.message, "team shooting stats failed", 500);
  }
};

// Shooting breakdown by player for a single team  (:team in URL)
export const playerShootingStats = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("player_shooting_stats(match_data, team_name)");
    return ok(res, await result.toJs(), "player shooting stats");
  } catch (err) {
    return fail(res, err.message, "player shooting stats failed", 500);
  }
};

// Pass accuracy summary for a team
export const teamPassAccuracy = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("pass_accuracy(match_data, team_name)");
    return ok(res, await result.toJs(), "pass accuracy");
  } catch (err) {
    return fail(res, err.message, "pass accuracy failed", 500);
  }
};

// Top 10 passers by volume for a team
export const topPassers = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("top_passers(match_data, team_name)");
    return ok(res, await result.toJs(), "top passers");
  } catch (err) {
    return fail(res, err.message, "top passers failed", 500);
  }
};

// Shot locations + xG for pitch map visualisation
export const shotMap = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("shot_map(match_data, team_name)");
    return ok(res, await result.toJs(), "shot map");
  } catch (err) {
    return fail(res, err.message, "shot map failed", 500);
  }
};

// Dribble success rate by player for a team
export const dribbleStats = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("dribble_stats(match_data, team_name)");
    return ok(res, await result.toJs(), "dribble stats");
  } catch (err) {
    return fail(res, err.message, "dribble stats failed", 500);
  }
};

// How often each action type is performed under pressure for a team
export const pressurePerformance = async (req, res) => {
  try {
    await ready;
    await webR.objs.globalEnv.bind("team_name", req.params.team);
    const result = await webR.evalR("pressure_performance(match_data, team_name)");
    return ok(res, await result.toJs(), "pressure performance");
  } catch (err) {
    return fail(res, err.message, "pressure performance failed", 500);
  }
};
