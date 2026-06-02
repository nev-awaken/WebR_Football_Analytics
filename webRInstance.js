import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
  loadRdsData,
} from "./helpers/webrSetup.js";
import { logStage } from "./helpers/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["teamStats.R"];
const R_DIR     = "r";

// Auto-discover datasets — picks up any file matching {comp_id}_{season_id}_{team}.rds
const dataDir  = path.join(__dirname, "data");
const RDS_FILES = fs.readdirSync(dataDir).filter(f => /^\d+_\d+_.+\.rds$/.test(f));

if (RDS_FILES.length === 0) console.warn("No datasets found in data/ — add an RDS via the generator");

const webR = new WebR();

const ready = (async () => {
  logStage("boot");
  await webR.init();
  logStage("after init");
  await mountPackageLibrary(webR, __dirname);
  await ensurePackages(webR, PACKAGES, __dirname);
  logStage("after pkgs");
  await loadRScripts(webR, R_SCRIPTS, path.join(__dirname, R_DIR));
  await loadRdsData(webR, RDS_FILES, __dirname);
  logStage("after data");
  console.log("webR ready");
})();

export { webR, ready };