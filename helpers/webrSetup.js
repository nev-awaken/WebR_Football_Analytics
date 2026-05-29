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
  await webR.evalR(`.libPaths(c('${LIB_VFS_DIR}', .libPaths()))`);
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
    await webR.evalR(`webr::install(c(${vec}), mount = FALSE)`);
  } else {
    console.log("All packages served from local cache — no download");
  }

  for (const pkg of packages) {
    // suppress the "masking objects" startup spam; errors still throw
    await webR.evalR(`suppressPackageStartupMessages(library(${pkg}))`);
  }
}

// Source each R file into the global environment.
export async function loadRScripts(webR, files, scriptDir) {
  for (const filename of files) {
    const localPath = path.join(scriptDir, filename);
    const webRPath = `/home/web_user/${filename}`;
    const encoded = new TextEncoder().encode(fs.readFileSync(localPath, "utf8"));
    await webR.FS.writeFile(webRPath, encoded);
    await webR.evalR(`source("${webRPath}", local = globalenv())`);
  }
}