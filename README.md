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


### Test API Endpoints Available:

- GET - /ping
- etc


  ---
  POST /stats/summary

  Returns summary statistics for a numeric array.

```
  curl -X POST http://localhost:3000/stats/summary \
    -H "Content-Type: application/json" \
    -d '{ "values": [10, 20, 30, 40, 50] }'
```
  ---
  POST /stats/t-test

  Runs a t-test between two numeric arrays. Returns a p-value.

```
  curl -X POST http://localhost:3000/stats/t-test \
    -H "Content-Type: application/json" \
    -d '{ "x": [10, 20, 30], "y": [15, 25, 35] }'
```

  Returns: { "p_value": <number> }

  ---
  POST /stats/pca

  Runs Principal Component Analysis on a 2D data matrix.

```
  curl -X POST http://localhost:3000/stats/pca \
    -H "Content-Type: application/json" \
    -d '{ "data": [[1, 2], [3, 4], [5, 6]] }'
```

  ---
  POST /stats/kmeans

  Runs K-Means clustering on a 2D data matrix.

```
  curl -X POST http://localhost:3000/stats/kmeans \
    -H "Content-Type: application/json" \
    -d '{ "data": [[1, 2], [3, 4], [5, 6]], "k": 2 }'


```
  Returns: { "clusters": [...] }

  ---
  POST /stats/pca

  Runs Principal Component Analysis on a 2D data matrix.

```
  curl -X POST http://localhost:3000/stats/pca \
    -H "Content-Type: application/json" \
    -d '{ "data": [[1, 2], [3, 4], [5, 6]] }'
```

Routes are defined in `routes` folder


### To add more packages to project
List of R packages are mentioned in `webrInstance.js` file. Add new packages and it will be downloaded on first run and stored into `r-library`.
So all the upcoming runs doesn't require the download of library again
