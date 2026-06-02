import { acquireWebR, releaseWebR, gcWebR } from "../webRInstance.js";
import { ok, fail } from "../helpers/response.js";

// These endpoints bind their inputs into the R global env. Clear any of them
// after the request so user data does not linger in the heap between calls.
const BOUND_GLOBALS = ["x", "y", "data_matrix", "k", "ts_values", "horizon"];
const CLEAR_GLOBALS = `rm(list = intersect(c(${BOUND_GLOBALS
  .map(n => `'${n}'`)
  .join(", ")}), ls(globalenv())), envir = globalenv())`;

// Always free request state: clear bound globals, purge the shelter, gc, release.
async function cleanup(webR, shelter) {
  try { await webR.evalRVoid(CLEAR_GLOBALS); } catch { /* best-effort */ }
  if (shelter) await shelter.purge();
  await gcWebR(webR);
  releaseWebR();
}

export const summaryStats = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    await webR.objs.globalEnv.bind("x", req.body.values);
    const result = await shelter.evalR("summary_stats(x)");
    return ok(res, await result.toJs(), "summary computed");
  } catch {
    return fail(res, null, "summary_stats failed", 500);
  } finally {
    await cleanup(webR, shelter);
  }
};

export const tTest = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    await webR.objs.globalEnv.bind("x", req.body.x);
    await webR.objs.globalEnv.bind("y", req.body.y);
    const result = await shelter.evalR("run_t_test(x, y)");
    return ok(res, { p_value: await result.toNumber() }, "t-test computed");
  } catch {
    return fail(res, null, "t-test failed", 500);
  } finally {
    await cleanup(webR, shelter);
  }
};

export const pca = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    await webR.objs.globalEnv.bind("data_matrix", req.body.data);
    const result = await shelter.evalR("run_pca(data_matrix)");
    res.json(await result.toJs());
  } catch (err) {
    console.error("PCA failed:", err);
    res.status(500).json({ error: "PCA failed" });
  } finally {
    await cleanup(webR, shelter);
  }
};

export const kMeans = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const { data, k } = req.body;
    await webR.objs.globalEnv.bind("data_matrix", data);
    await webR.objs.globalEnv.bind("k", k);
    const result = await shelter.evalR("run_kmeans(data_matrix, k)");
    res.json({ clusters: await result.toJs() });
  } catch (err) {
    console.error("K-Means failed:", err);
    res.status(500).json({ error: "k-means failed" });
  } finally {
    await cleanup(webR, shelter);
  }
};

export const hwForecast = async (req, res) => {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const { values, horizon } = req.body;
    await webR.objs.globalEnv.bind("ts_values", values);
    await webR.objs.globalEnv.bind("horizon", horizon || 5);
    const result = await shelter.evalR("run_hw_forecast(ts_values, horizon)");
    res.json({ forecast: await result.toJs() });
  } catch (err) {
    console.error("HW Forecast failed:", err);
    res.status(500).json({ error: "Forecasting failed" });
  } finally {
    await cleanup(webR, shelter);
  }
};

export async function testDplyr(req, res) {
  const webR = await acquireWebR();
  const shelter = await new webR.Shelter();
  try {
    const { values } = req.body;
    const result = await shelter.evalR(`test_dplyr(c(${values.join(",")}))`);
    res.json(await result.toJs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await cleanup(webR, shelter);
  }
}
