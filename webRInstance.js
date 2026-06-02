import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
  mountDataDir,
} from "./helpers/webrSetup.js";
import { logStage } from "./helpers/monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["teamStats.R"];
const R_DIR     = "r";

// Auto-discover datasets — picks up any file matching {comp_id}_{season_id}_{team}.rds
const dataDir = path.join(__dirname, "data");
const RDS_FILES = fs.readdirSync(dataDir).filter(f => /^\d+_\d+_.+\.rds$/.test(f));

if (RDS_FILES.length === 0) console.warn("No datasets found in data/ — add an RDS via the generator");

// Team name → filename map built from JSON sidecars (e.g. { "Arsenal": "2_27_arsenal.rds" })
export const datasetMap = Object.fromEntries(
  RDS_FILES.flatMap(file => {
    const jsonPath = path.join(dataDir, file.replace(".rds", ".json"));
    if (!fs.existsSync(jsonPath)) return [];
    const team = JSON.parse(fs.readFileSync(jsonPath, "utf8")).team;
    return [[team, file]];
  })
);

const webR = new WebR();

const ready = (async () => {
  logStage("boot");
  await webR.init();
  logStage("after init");
  await mountPackageLibrary(webR, __dirname);
  await ensurePackages(webR, PACKAGES, __dirname);
  logStage("after pkgs");
  await loadRScripts(webR, R_SCRIPTS, path.join(__dirname, R_DIR));
  await mountDataDir(webR, __dirname);
  const teams = Object.keys(datasetMap).map(t => `"${t.replace(/"/g, '\\"')}"`).join(", ");
  await webR.evalRVoid(`dataset_teams <- c(${teams})`);
  logStage("ready");
  console.log("webR ready");
})();

export { webR, ready };