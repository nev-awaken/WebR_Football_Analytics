import { acquireWebR, releaseWebR, gcWebR, matchOutcomeModelLoaded } from "../webRInstance.js";
import { ok, fail } from "../helpers/response.js";

// DOMAIN: football match-outcome prediction.
// The trained model is loaded once at startup into the R global MATCH_OUTCOME_MODEL
// (see webRInstance.js). These handlers simulate from it — they never train.
// If no artifact exists, every endpoint returns a clear 503 telling the user how
// to create one.

const NOT_TRAINED =
  "no trained model found — run r/matchOutcomeTrainer.R (or node r/buildMatchOutcomeModel.mjs) to create models/matchOutcome.rds";

// GET /match-outcome/model — the trained + back-tested ratings, for inspection.
export const getModel = async (req, res) => {
  if (!matchOutcomeModelLoaded()) return fail(res, null, NOT_TRAINED, 503);
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(`match_outcome_summary(MATCH_OUTCOME_MODEL)`);
    return ok(res, await result.toJs(), "match-outcome model");
  } catch (err) {
    return fail(res, err.message, "match-outcome model failed", 500);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};

// GET /match-outcome/simulate?home=<team>&away=<team>&n=<sims>
// Monte-Carlo simulate a single fixture from the loaded model.
export const simulate = async (req, res) => {
  if (!matchOutcomeModelLoaded()) return fail(res, null, NOT_TRAINED, 503);

  const home = req.query.home;
  const away = req.query.away;
  if (!home || !away) return fail(res, null, "home and away query params are required", 400);
  if (home === away) return fail(res, null, "home and away must be different teams", 400);

  const nSims = Math.min(Math.max(parseInt(req.query.n, 10) || 10000, 1000), 50000);

  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const result = await shelter.evalR(
      `match_outcome_simulate(MATCH_OUTCOME_MODEL, ${JSON.stringify(home)}, ${JSON.stringify(away)}, ${nSims})`
    );
    return ok(res, await result.toJs(), "match-outcome simulation");
  } catch (err) {
    // match_outcome_simulate stop()s on a team not in the model — that's caller
    // input, not a server fault.
    const status = /unknown (home|away) team/.test(err.message) ? 400 : 500;
    return fail(res, err.message, "match-outcome simulation failed", status);
  } finally {
    await shelter.purge();
    await gcWebR(webR);
    releaseWebR();
  }
};
