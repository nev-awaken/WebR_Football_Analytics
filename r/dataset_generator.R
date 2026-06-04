# * ------ Locally Used File Not Part of the Web Server -----------

# Run FreeCompetitions() in R console to look up competition and season IDs
COMP_ID     <- 2          # 2  = Premier League
SEASON_ID   <- 27         # 27 = 2015/2016
DATASET_DIR <- "./data"

TEAMS <- c(
  "Arsenal",
  "Manchester City",
  "Manchester United",
  "Aston Villa"
)

SLEEP_BETWEEN_TEAMS_S  <- 5   # pause between teams
SLEEP_BEFORE_EVENTS_S  <- 2   # pause between matches fetch and events fetch
# ─────────────────────────────────────────────────────────────────────────────

library(dplyr)
library(jsonlite)
library(StatsBombR)

if (!dir.exists(DATASET_DIR)) dir.create(DATASET_DIR, recursive = TRUE)

# Fetch competition + all matches once — reused for every team
comps       <- FreeCompetitions()
comp_row    <- comps %>% filter(competition_id == COMP_ID, season_id == SEASON_ID)
all_matches <- FreeMatches(comp_row)
cat("Competition:", comp_row$competition_name, "·", comp_row$season_name, "\n")
cat("Generating datasets for", length(TEAMS), "team(s)\n\n")

generate_dataset <- function(team_name) {
  cat("──────────────────────────────────────\n")
  cat("Team:", team_name, "\n")

  matches <- all_matches %>%
    filter(
      home_team.home_team_name == team_name |
      away_team.away_team_name == team_name
    )
  cat("Matches found:", nrow(matches), "\n")

  Sys.sleep(SLEEP_BEFORE_EVENTS_S)

  cat("Fetching events...\n")
  events_raw <- tibble()
  for (i in seq_len(nrow(matches))) {
    events_raw <- bind_rows(events_raw, get.matchFree(matches[i, ]))
  }
  events_raw <- allclean(events_raw)
  cat("Total events:", nrow(events_raw), "\n")

  match_meta <- matches %>%
    mutate(match_id = as.integer(match_id)) %>%
    select(
      match_id,
      match_date,
      season          = season.season_name,
      match_home_team = home_team.home_team_name,
      match_away_team = away_team.away_team_name
    )

  events <- events_raw %>%
    mutate(match_id = as.integer(match_id)) %>%
    left_join(match_meta, by = "match_id") %>%
    mutate(
      opponent = if_else(team.name == match_home_team, match_away_team, match_home_team),
      is_home  = team.name == match_home_team
    )

  team_slug <- tolower(gsub(" ", "_", team_name))
  file_base <- paste0(COMP_ID, "_", SEASON_ID, "_", team_slug)
  rds_path  <- file.path(DATASET_DIR, paste0(file_base, ".rds"))
  json_path <- file.path(DATASET_DIR, paste0(file_base, ".json"))

  matches_list <- matches %>%
    mutate(
      opponent = if_else(home_team.home_team_name == team_name,
                         away_team.away_team_name,
                         home_team.home_team_name),
      is_home  = home_team.home_team_name == team_name,
      score    = paste0(home_score, "-", away_score)
    ) %>%
    select(match_id, match_date, opponent, is_home, score) %>%
    arrange(match_date)

  metadata <- list(
    competition_id = COMP_ID,
    season_id      = SEASON_ID,
    team           = team_name,
    season         = matches$season.season_name[[1]],
    competition    = matches$competition.competition_name[[1]],
    total_matches  = nrow(matches),
    file           = paste0(file_base, ".rds"),
    matches        = matches_list
  )

  events_slim <- events %>%
    dplyr::select(
      match_id, index,          # (match_id, index) uniquely identifies a StatsBomb
                                # event — used to dedupe head-to-head matches that
                                # are stored in two teams' files (see combine_datasets)
      minute, type.name, under_pressure,
      team.name, player.name,
      shot.outcome.name, shot.statsbomb_xg,
      shot.body_part.name, shot.technique.name, shot.type.name,
      location.x, location.y,
      pass.outcome.name, pass.length, pass.shot_assist, pass.goal_assist,
      dribble.outcome.name
    )

  saveRDS(events_slim, rds_path, compress = "xz")
  write_json(metadata, json_path, pretty = TRUE, auto_unbox = TRUE)

  cat("Saved:", rds_path, "\n")
}

for (i in seq_along(TEAMS)) {
  generate_dataset(TEAMS[[i]])
  if (i < length(TEAMS)) Sys.sleep(SLEEP_BETWEEN_TEAMS_S)
}

cat("\n──────────────────────────────────────\n")
cat("Done —", length(TEAMS), "dataset(s) generated\n")
