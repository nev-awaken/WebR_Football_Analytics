import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
  loadCsvData,
} from "./helpers/webrSetup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["functions.R", "teamStats.R"];
const R_DIR     = "r";
const CSV_DATA  = [
  { file: "arsenal_match_2015_2016.csv", rVar: "match_data" },
];


const webR = new WebR();

const ready = (async () => {
  await webR.init();
  await mountPackageLibrary(webR, __dirname);
  await ensurePackages(webR, PACKAGES, __dirname);
  await loadRScripts(webR, R_SCRIPTS, path.join(__dirname, R_DIR));
  for (const { file, rVar } of CSV_DATA) {
    await loadCsvData(webR, path.join(__dirname, "data", file), rVar);
  }
  console.log("webR ready");
})();

export { webR, ready };