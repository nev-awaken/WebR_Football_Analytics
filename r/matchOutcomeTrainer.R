# * ------ Match-Outcome Prediction — Model Trainer (offline) -----------------
#
# DOMAIN: football match-outcome prediction.
#
# Run this LOCALLY (RStudio / Positron), like dataset_generator.R. It reads the
# JSON sidecars in ./data, fits a Poisson attack/defence ratings model, back-tests
# it on the same matches, and saves the trained artifact to ./models:
#
#     models/matchOutcome.rds    <- the trained model (loaded by the server at startup)
#     models/matchOutcome.json   <- metadata sidecar (trained_at, n_matches, test metrics)
#
# The server NEVER runs this file. It only readRDS()-loads the .rds artifact into
# the R global MATCH_OUTCOME_MODEL (see webRInstance.js) and simulates from it
# (see r/matchOutcome.R).
#
# train_match_outcome_model() is intentionally base-R only (no packages) so the
# one-off Node generator (r/buildMatchOutcomeModel.mjs) can reuse the exact same
# fitting logic inside WebR. Only build_match_table() + the local-run block below
# use jsonlite for I/O.
# ─────────────────────────────────────────────────────────────────────────────

# Fit Poisson attack/defence ratings from a table of match results.
#
# `matches` must have columns: home_team, away_team, home_goals, away_goals.
# Model:  log(E[goals]) = intercept + home_adv*is_home + attack[scorer] + defence[conceder]
#
# This is just the high-level recipe — each step is a helper defined below:
#   clean_match_table   -> drop rows with missing scores, coerce team names
#   fit_poisson_ratings -> the glm; per-team attack/defence + intercept/home_adv
#   centre_ratings      -> shift attack/defence to mean 0 (0 = league average)
#   backtest_ratings    -> re-predict the same matches and score the fit

NEEDED_COLS <- c("home_team", "away_team", "home_goals", "away_goals")

train_match_outcome_model <- function(matches) {
	matches <- clean_match_table(matches)
	teams <- sort(unique(c(matches$home_team, matches$away_team)))

	ratings <- fit_poisson_ratings(matches, teams)
	ratings <- centre_ratings(ratings)
	test <- backtest_ratings(matches, ratings)

	list(
		teams = ratings$teams,
		attack = ratings$attack,
		defence = ratings$defence, # positive = concedes MORE (weaker defence)
		home_adv = ratings$home_adv,
		intercept = ratings$intercept,
		meta = list(
			trained_at = format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
			n_matches = nrow(matches),
			model = "Poisson attack/defence ratings"
		),
		test = test
	)
}

# ---- Training building blocks ----------------------------------------------

# Validate the raw match table, drop rows with missing scores, coerce team names.
clean_match_table <- function(matches) {
	stopifnot(all(NEEDED_COLS %in% names(matches)))
	matches <- matches[
		!is.na(matches$home_goals) & !is.na(matches$away_goals),
		,
		drop = FALSE
	]
	matches$home_team <- as.character(matches$home_team)
	matches$away_team <- as.character(matches$away_team)
	matches
}

# Reshape into one row per attacking side (home attacking, then away attacking) —
# the long format the Poisson glm expects.
to_long_goals <- function(matches, teams) {
	data.frame(
		goals = c(matches$home_goals, matches$away_goals),
		attack_team = factor(
			c(matches$home_team, matches$away_team),
			levels = teams
		),
		defend_team = factor(
			c(matches$away_team, matches$home_team),
			levels = teams
		),
		is_home = c(rep(1L, nrow(matches)), rep(0L, nrow(matches)))
	)
}

# Fit the glm and pull attack/defence/intercept/home_adv out of the coefficient
# vector into named per-team vectors (0 for the reference team glm drops).
fit_poisson_ratings <- function(matches, teams) {
	long <- to_long_goals(matches, teams)
	fit <- glm(
		goals ~ is_home + attack_team + defend_team,
		family = poisson(link = "log"),
		data = long
	)
	co <- coef(fit)

	att <- setNames(numeric(length(teams)), teams)
	def <- setNames(numeric(length(teams)), teams)
	for (t in teams) {
		an <- paste0("attack_team", t)
		dn <- paste0("defend_team", t)
		if (an %in% names(co) && !is.na(co[[an]])) {
			att[[t]] <- co[[an]]
		}
		if (dn %in% names(co) && !is.na(co[[dn]])) def[[t]] <- co[[dn]]
	}

	list(
		teams = teams,
		attack = att,
		defence = def,
		intercept = co[["(Intercept)"]],
		home_adv = if ("is_home" %in% names(co)) co[["is_home"]] else 0
	)
}

# Centre attack/defence to mean 0 and fold the means into the intercept. The
# predicted rates are identical, but the ratings now read intuitively (0 = average).
centre_ratings <- function(ratings) {
	am <- mean(ratings$attack)
	dm <- mean(ratings$defence)
	ratings$attack <- ratings$attack - am
	ratings$defence <- ratings$defence - dm
	ratings$intercept <- ratings$intercept + am + dm
	ratings
}

# Expected goals (lambda) for each side of every match, given a fitted ratings list.
expected_goals <- function(matches, ratings) {
	list(
		home = exp(
			ratings$intercept +
				ratings$home_adv +
				ratings$attack[matches$home_team] +
				ratings$defence[matches$away_team]
		),
		away = exp(
			ratings$intercept +
				ratings$attack[matches$away_team] +
				ratings$defence[matches$home_team]
		)
	)
}

# Back-test the ratings on a set of matches: outcome accuracy (argmax over the
# Poisson score grid, so draws are possible), goal MAE, and total log-likelihood.
backtest_ratings <- function(matches, ratings) {
	lam <- expected_goals(matches, ratings)
	lam_h <- lam$home
	lam_a <- lam$away

	actual <- ifelse(
		matches$home_goals > matches$away_goals,
		"H",
		ifelse(matches$home_goals < matches$away_goals, "A", "D")
	)

	# Predicted outcome = argmax over the Poisson score grid (so draws are possible)
	preds <- vapply(
		seq_len(nrow(matches)),
		function(k) {
			m <- outer(dpois(0:10, lam_h[[k]]), dpois(0:10, lam_a[[k]]))
			hw <- sum(m[lower.tri(m)])
			dr <- sum(diag(m))
			aw <- sum(m[upper.tri(m)])
			c("H", "D", "A")[which.max(c(hw, dr, aw))]
		},
		character(1)
	)

	list(
		outcome_accuracy = round(mean(preds == actual) * 100, 1), # % of results predicted
		mean_abs_error = round(
			mean(
				abs(lam_h - matches$home_goals) +
					abs(lam_a - matches$away_goals)
			) /
				2,
			3
		), # goals/side
		log_likelihood = round(
			sum(
				dpois(matches$home_goals, lam_h, log = TRUE) +
					dpois(matches$away_goals, lam_a, log = TRUE)
			),
			1
		),
		n_test = nrow(matches)
	)
}

# Build a unique match-results table from the data/ JSON files (local only).
# If a full-season results file (results_*.json, from seasonResultsGenerator.R)
# is present it is used in preference — it already covers the whole league in
# home/away orientation. Otherwise we fall back to the per-team event sidecars.
# Either way head-to-head matches are deduped on match_id.
build_match_table <- function(data_dir = "./data") {
	results_files <- list.files(
		data_dir, pattern = "^results_.*\\.json$", full.names = TRUE
	)
	if (length(results_files) > 0) {
		return(build_match_table_from_results(results_files))
	}
	build_match_table_from_sidecars(data_dir)
}

# Full-season results file: matches are already {home_team, away_team,
# home_goals, away_goals}, one row per match — no orientation or score parsing.
build_match_table_from_results <- function(files) {
	rows <- list()
	for (f in files) {
		meta <- jsonlite::fromJSON(f, simplifyVector = FALSE)
		for (mt in meta$matches) {
			rows[[length(rows) + 1]] <- data.frame(
				match_id = mt$match_id,
				home_team = mt$home_team,
				away_team = mt$away_team,
				home_goals = as.integer(mt$home_goals),
				away_goals = as.integer(mt$away_goals),
				stringsAsFactors = FALSE
			)
		}
	}
	all <- do.call(rbind, rows)
	all <- all[!duplicated(all$match_id), , drop = FALSE]
	all[, c("home_team", "away_team", "home_goals", "away_goals")]
}

# Per-team event sidecars: a match between two dataset teams appears in both
# files, so dedupe on match_id. Score is stored "home-away" regardless of which
# team's file it is (see dataset_generator.R), so goals are read from the string.
build_match_table_from_sidecars <- function(data_dir) {
	files <- list.files(data_dir, pattern = "\\.json$", full.names = TRUE)
	rows <- list()
	for (f in files) {
		meta <- jsonlite::fromJSON(f, simplifyVector = FALSE)
		team <- meta$team
		for (mt in meta$matches) {
			sc <- as.integer(strsplit(mt$score, "-", fixed = TRUE)[[1]])
			home <- if (isTRUE(mt$is_home)) team else mt$opponent
			away <- if (isTRUE(mt$is_home)) mt$opponent else team
			rows[[length(rows) + 1]] <- data.frame(
				match_id = mt$match_id,
				home_team = home,
				away_team = away,
				home_goals = sc[1],
				away_goals = sc[2],
				stringsAsFactors = FALSE
			)
		}
	}
	all <- do.call(rbind, rows)
	all <- all[!duplicated(all$match_id), , drop = FALSE]
	all[, c("home_team", "away_team", "home_goals", "away_goals")]
}

# ---- Local run (RStudio / Positron) ----------------------------------------
# Skipped when sourced by the Node generator, which sets this option and calls
# train_match_outcome_model() directly with its own match table.
if (!isTRUE(getOption("match_outcome_no_run"))) {
	library(jsonlite)

	DATA_DIR <- "./data"
	MODEL_DIR <- "./models"
	if (!dir.exists(MODEL_DIR)) {
		dir.create(MODEL_DIR, recursive = TRUE)
	}

	matches <- build_match_table(DATA_DIR)
	cat(
		"Training on",
		nrow(matches),
		"unique matches across",
		length(unique(c(matches$home_team, matches$away_team))),
		"teams\n"
	)

	model <- train_match_outcome_model(matches)
	saveRDS(model, file.path(MODEL_DIR, "matchOutcome.rds"))

	# Read competition/season from any data sidecar for the metadata
	meta_files <- list.files(DATA_DIR, pattern = "\\.json$", full.names = TRUE)
	one <- jsonlite::fromJSON(meta_files[[1]], simplifyVector = TRUE)

	sidecar <- list(
		model = "match-outcome-prediction",
		method = model$meta$model,
		trained_at = model$meta$trained_at,
		competition = one$competition,
		season = one$season,
		n_matches = model$meta$n_matches,
		n_teams = length(model$teams),
		test = model$test
	)
	write_json(
		sidecar,
		file.path(MODEL_DIR, "matchOutcome.json"),
		pretty = TRUE,
		auto_unbox = TRUE
	)

	cat("Saved:", file.path(MODEL_DIR, "matchOutcome.rds"), "\n")
	cat(
		"Back-test outcome accuracy:",
		model$test$outcome_accuracy,
		"%  |  MAE:",
		model$test$mean_abs_error,
		"goals\n"
	)
}
