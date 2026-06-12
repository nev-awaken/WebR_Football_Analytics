# * ------ Match-Outcome Prediction — Runtime (loaded into WebR) --------------
#
# DOMAIN: football match-outcome prediction.
#
# These functions run inside the server's WebR instance. They operate on the
# trained model loaded into the R global MATCH_OUTCOME_MODEL (see webRInstance.js,
# which readRDS()-loads models/matchOutcome.rds). The model is produced offline by
# r/matchOutcomeTrainer.R — this file never fits anything, it only simulates.
# ─────────────────────────────────────────────────────────────────────────────

# Monte-Carlo simulate a single match between two teams in the trained model.
# Returns win/draw/loss probabilities, expected goals, the most likely scoreline,
# the top scorelines, and a 0-5 score-probability grid for a heatmap.
match_outcome_simulate <- function(model, home, away, n_sims = 10000) {
  teams <- model$teams
  if (!(home %in% teams)) stop(paste0("unknown home team: ", home))
  if (!(away %in% teams)) stop(paste0("unknown away team: ", away))

  att <- model$attack
  def <- model$defence
  lambda_home <- exp(model$intercept + model$home_adv + att[[home]] + def[[away]])
  lambda_away <- exp(model$intercept +                   att[[away]] + def[[home]])

  hg <- rpois(n_sims, lambda_home)
  ag <- rpois(n_sims, lambda_away)

  home_win <- mean(hg > ag)
  draw     <- mean(hg == ag)
  away_win <- mean(hg < ag)

  # Top scorelines by simulated frequency
  scores <- paste0(hg, "-", ag)
  tab    <- sort(table(scores), decreasing = TRUE)
  top    <- head(tab, 6)
  top_scores <- data.frame(
    score = names(top),
    pct   = round(as.numeric(top) / n_sims * 100, 1),
    stringsAsFactors = FALSE
  )

  # Score-probability grid 0..5 (goals capped at 5) in long format for a heatmap
  cap <- 5
  hgc <- pmin(hg, cap)
  agc <- pmin(ag, cap)
  grid <- expand.grid(home_goals = 0:cap, away_goals = 0:cap)
  grid$pct <- round(mapply(function(i, j) mean(hgc == i & agc == j),
                           grid$home_goals, grid$away_goals) * 100, 2)

  list(
    home           = home,
    away           = away,
    n_sims         = n_sims,
    home_win       = round(home_win * 100, 1),
    draw           = round(draw * 100, 1),
    away_win       = round(away_win * 100, 1),
    exp_home_goals = round(lambda_home, 2),
    exp_away_goals = round(lambda_away, 2),
    likely_score   = names(top)[1],
    top_scores     = top_scores,
    score_grid     = grid,
    grid_cap       = cap
  )
}

# Summarise the trained model for inspection in the UI: the ratings table (one
# row per team, ordered by net rating) plus training/back-test metadata.
match_outcome_summary <- function(model) {
  teams <- model$teams
  ratings <- data.frame(
    team    = teams,
    attack  = round(as.numeric(model$attack[teams]),  3),
    defence = round(as.numeric(model$defence[teams]), 3),
    stringsAsFactors = FALSE
  )
  # net rating: stronger attack (higher) + stronger defence (lower defence value)
  ratings$rating <- round(ratings$attack - ratings$defence, 3)
  ratings <- ratings[order(-ratings$rating), ]

  list(
    meta     = model$meta,
    test     = model$test,
    home_adv = round(model$home_adv, 3),
    ratings  = ratings
  )
}
