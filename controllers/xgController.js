import { ok, fail } from "../helpers/response.js";

export const predictXg = async (req, res) =>
  fail(res, null, "the server doesn't support the functionality to fulfill this request", 501);