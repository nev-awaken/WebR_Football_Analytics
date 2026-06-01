import fs from "fs";
import path from "path";

const LIB_VFS_DIR = "/home/web_user/r-library";

// Mount the on-disk package cache into R's virtual filesystem and make it
// the first place R looks/installs (.libPaths = R's library search path).
export async function mountPackageLibrary(webR, rootDir) {
  const libHostDir = path.join(rootDir, "r-library");
  fs.mkdirSync(libHostDir, { recursive: true });
  await webR.FS.mkdir(LIB_VFS_DIR);
  await webR.FS.mount("NODEFS", { root: libHostDir }, LIB_VFS_DIR);
  await webR.evalRVoid(`.libPaths(c('${LIB_VFS_DIR}', .libPaths()))`);
}

// Install only the packages not already cached on disk, then load all of them.
export async function ensurePackages(webR, packages, rootDir) {
  const libHostDir = path.join(rootDir, "r-library");

  const missing = packages.filter(
    (pkg) => !fs.existsSync(path.join(libHostDir, pkg))
  );

  if (missing.length) {
    console.log(`Caching to disk (one-time): ${missing.join(", ")}`);
    const vec = missing.map((p) => `"${p}"`).join(", ");
    await webR.evalRVoid(`webr::install(c(${vec}), mount = FALSE)`);
  } else {
    console.log("All packages served from local cache — no download");
  }

  for (const pkg of packages) {
    await webR.evalRVoid(`suppressPackageStartupMessages(library(${pkg}))`);
  }
}

export async function loadRdsData(webR, rdsFiles, rootDir) {
  const webRDir  = "/home/web_user/data";
  const dataHost = path.join(rootDir, "data");
  await webR.FS.mkdir(webRDir);
  // Mount the host data dir directly — no file bytes copied into the WASM heap
  await webR.FS.mount("NODEFS", { root: dataHost }, webRDir);

  await webR.evalRVoid('dataset_teams <- character(0)');

  for (const file of rdsFiles) {
    const webRPath = `${webRDir}/${file}`;
    const jsonPath = path.join(rootDir, "data", file.replace(".rds", ".json"));

    await webR.evalRVoid(`
      tmp        <- readRDS("${webRPath}")
      match_data <- if (exists("match_data")) dplyr::bind_rows(match_data, tmp) else tmp
      rm(tmp)
    `);

    if (fs.existsSync(jsonPath)) {
      const team = JSON.parse(fs.readFileSync(jsonPath, "utf8")).team.replace(/"/g, '\\"');
      await webR.evalRVoid(`dataset_teams <- c(dataset_teams, "${team}")`);
    }

    console.log(`Loaded: ${file}`);
  }
}

export async function loadRScripts(webR, files, scriptDir) {
  for (const filename of files) {
    const localPath = path.join(scriptDir, filename);
    const webRPath = `/home/web_user/${filename}`;
    const encoded = new TextEncoder().encode(fs.readFileSync(localPath, "utf8"));
    await webR.FS.writeFile(webRPath, encoded);
    await webR.evalRVoid(`source("${webRPath}", local = globalenv())`);
  }
}