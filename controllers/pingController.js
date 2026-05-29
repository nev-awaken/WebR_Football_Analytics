import { DateTime } from "luxon";
import { ok, fail } from "../helpers/response.js";

export const pingServer = async (req, res) =>
  ok(res, null, "Backend is alive & running");
