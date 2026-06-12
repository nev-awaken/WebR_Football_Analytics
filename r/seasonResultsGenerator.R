# * ------ Full-Season Results Generator (offline, local only) ----------------
#
# DOMAIN: football match-outcome prediction.
#
# Run this LOCALLY (RStudio / Positron), like dataset_generator.R. It pulls ONE
# season's match results from StatsBomb and writes a single results file:
#
#     data/results_{comp}_{season}.json
#
# Unlike dataset_generator.R this does NOT download event data — it stops after
# the matches call, so it's a single lightweight pull (no per-match events loop).
# The match-outcome trainer (matchOutcomeTrainer.R) only needs results, and when
# a results_*.json file is present it uses it in preference to the per-team
# sidecars — giving the model the FULL league (every team, full schedule) instead
# of only the teams you generated event data for.
#
# Team-name strings come straight from FreeMatches() — identical to the names
# dataset_generator.R writes — so they line up across all files.
# ─────────────────────────────────────────────────────────────────────────────

# Run FreeCompetitions() in the R console to look up competition and season IDs.
COMP_ID     <- 2          # 2  = Premier League
SEASON_ID   <- 27         # 27 = 2015/2016
DATASET_DIR <- "./data"
# ─────────────────────────────────────────────────────────────────────────────

library(dplyr)
library(jsonlite)
library(StatsBombR)

if (!dir.exists(DATASET_DIR)) dir.create(DATASET_DIR, recursive = TRUE)

# One pull: the whole season's matches (home/away teams + final scores).
comps    <- FreeCompetitions()
comp_row <- comps %>% filter(competition_id == COMP_ID, season_id == SEASON_ID)
stopifnot(nrow(comp_row) == 1)

all_matches <- FreeMatches(comp_row)
cat("Competition:", comp_row$competition_name, "·", comp_row$season_name, "\n")
cat("Matches returned:", nrow(all_matches), "\n")

# Already home/away oriented — write home_goals/away_goals directly (no score
# string, no is_home, no per-team duplication, so no flipping or dedupe needed).
matches_list <- all_matches %>%
  filter(!is.na(home_score), !is.na(away_score)) %>%
  mutate(match_id = as.integer(match_id)) %>%
  transmute(
    match_id,
    match_date,
    home_team  = home_team.home_team_name,
    away_team  = away_team.away_team_name,
    home_goals = as.integer(home_score),
    away_goals = as.integer(away_score)
  ) %>%
  arrange(match_date)

cat("Matches with final scores:", nrow(matches_list), "\n")

metadata <- list(
  competition_id = COMP_ID,
  season_id      = SEASON_ID,
  competition    = comp_row$competition_name[[1]],
  season         = comp_row$season_name[[1]],
  total_matches  = nrow(matches_list),
  generated_at   = format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
  matches        = matches_list
)

out_path <- file.path(DATASET_DIR, paste0("results_", COMP_ID, "_", SEASON_ID, ".json"))
write_json(metadata, out_path, pretty = TRUE, auto_unbox = TRUE)

cat("Saved:", out_path, "\n")
cat("Teams in file:",
    length(unique(c(matches_list$home_team, matches_list$away_team))), "\n")
cat("Next: re-run the trainer (matchOutcomeTrainer.R or node r/buildMatchOutcomeModel.mjs)\n")
