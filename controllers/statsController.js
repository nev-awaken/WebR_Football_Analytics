import { webR } from "../webrInstance.js";
import { ok, fail } from "../helpers/response.js";

export const summaryStats = async (req, res) => {
  try {
    await webR.objs.globalEnv.bind("x", req.body.values);
    const result = await webR.evalR("summary_stats(x)");
    return ok(res, await result.toJs(), "summary computed")
  } catch {
    return fail(res, "summary_stats failed", 500);
  }
};

export const tTest = async (req, res) => {
  try {
    await webR.objs.globalEnv.bind("x", req.body.x);
    await webR.objs.globalEnv.bind("y", req.body.y);
    const result = await webR.evalR("run_t_test(x, y)");
    return ok(res, { p_value: await result.toNumber() }, "t-test computed");
  } catch {
    return fail(res, "t-test failed", 500);
  }
};

export const pca = async (req, res) => {
  try {
    await webR.objs.globalEnv.bind("data_matrix", req.body.data);
    const result = await webR.evalR("run_pca(data_matrix)");
    res.json(await result.toJs());
  } catch (err) {
    console.error("PCA failed:", err);
    res.status(500).json({ error: "PCA failed" });
  }
};

export const kMeans = async (req, res) => {
  try {
    const { data, k } = req.body;
    await webR.objs.globalEnv.bind("data_matrix", data);
    await webR.objs.globalEnv.bind("k", k);
    const result = await webR.evalR("run_kmeans(data_matrix, k)");
    res.json({ clusters: await result.toJs() });
  } catch (err) {
    console.error("K-Means failed:", err);
    res.status(500).json({ error: "k-means failed" });
  }
};

export const hwForecast = async (req, res) => {
  try {
    const { values, horizon } = req.body;
    await webR.objs.globalEnv.bind("ts_values", values);
    await webR.objs.globalEnv.bind("horizon", horizon || 5);
    const result = await webR.evalR("run_hw_forecast(ts_values, horizon)");
    res.json({ forecast: await result.toJs() });
  } catch (err) {
    console.error("HW Forecast failed:", err);
    res.status(500).json({ error: "Forecasting failed" });
  }
};


export async function testDplyr(req, res) {
  try {
    const { values } = req.body;
    const result = await webR.evalR(`test_dplyr(c(${values.join(",")}))`);
    const output = await result.toJs();
    res.json(output);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}