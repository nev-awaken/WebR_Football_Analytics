import path from "path";
import { fileURLToPath } from "url";
import { WebR } from "webr";
import {
  mountPackageLibrary,
  ensurePackages,
  loadRScripts,
} from "./helpers/webrSetup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Add R packages and Scripts needed for the project here
const PACKAGES  = ["dplyr"];
const R_SCRIPTS = ["functions.R", "teamStats.R"];
const R_DIR     = "r";


const webR = new WebR();

const ready = (async () => {
  await webR.init();
  await mountPackageLibrary(webR, __dirname);
  await ensurePackages(webR, PACKAGES, __dirname);
  await loadRScripts(webR, R_SCRIPTS, path.join(__dirname, R_DIR));
  console.log("webR ready");
})();

export { webR, ready };