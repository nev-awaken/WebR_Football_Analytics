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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["teamStats.R"];
const R_DIR     = "r";

// Auto-discover datasets — picks up any file matching {comp_id}_{season_id}_{team}.rds
const dataDir  = path.join(__dirname, "data");
const RDS_FILES = fs.readdirSync(dataDir).filter(f => /^\d+_\d+_.+\.rds$/.test(f));

if (RDS_FILES.length === 0) console.warn("No datasets found in data/ — add an RDS via the generator");

const rss = () => `${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`;

const webR = new WebR();

const ready = (async () => {
  console.log(`[mem] boot          ${rss()}`);
  await webR.init();
  console.log(`[mem] after init    ${rss()}`);
  await mountPackageLibrary(webR, __dirname);
  await ensurePackages(webR, PACKAGES, __dirname);
  console.log(`[mem] after pkgs    ${rss()}`);
  await loadRScripts(webR, R_SCRIPTS, path.join(__dirname, R_DIR));
  await loadRdsData(webR, RDS_FILES, __dirname);
  console.log(`[mem] after data    ${rss()}`);
  console.log("webR ready");
})();

export { webR, ready };