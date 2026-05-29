## Web R & Express JS - FootBall Analytics Backend

Brings R's statistical capabilities into a Node/Express backend **without installing R**

R runs as WebAssembly via the **`webr`** package; everything
arrives through **`npm install`**.

## Requirements

- Node.js ≥ 18 (tested on 20.17.0)
- Internet access required on first run (R packages download once, then cache to `r-library/`)

### Install Node Packages

```
npm install
```

**NOTE:** This also applies local patches to `webr` (via `patch-package`) needed to run
under Node on Windows.

## Run

```
node ./index.js
```

Server starts on http://localhost:3000. First launch downloads + caches R
packages (dplyr); later launches load them from disk, no network needed.


### Endpoints Available:

- GET - /ping
- etc

Routes are defined in `routes` folder


### To add more packages to project
List of R packages are mentioned in `webrInstance.js` file. Add new packages and it will be downloaded on first run and stored into r-library.
So all the upcoming runs doesn't require the download of library again
