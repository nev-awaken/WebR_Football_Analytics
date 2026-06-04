defactorise <- function(df) dplyr::mutate(df, dplyr::across(where(is.factor), as.character))

# Combine all preloaded team datasets into one frame for multi-team analysis.
# A match between two dataset teams is stored in BOTH teams' files, so the same
# events appear twice after bind_rows — which double-counts the all-teams stats.
# (match_id, index) uniquely identifies a StatsBomb event and is identical across
# files, so distinct() drops the duplicates. Guarded with %in% so it stays a safe
# no-op on older datasets generated before these columns were added.
combine_datasets <- function(data_list) {
  combined <- dplyr::bind_rows(data_list)
  if (all(c("match_id", "index") %in% names(combined))) {
    combined <- dplyr::distinct(combined, match_id, index, .keep_all = TRUE)
  }
  combined
}

ACTION_TYPE <- list(
    "PASS"    = "Pass",
    "CARRY"   = "Carry",
    "DRIBBLE" = "Dribble",
    "SHOT"    = "Shot"
)

SHOT_OUTCOME <- list(
  "GOAL" = "Goal"
)

DRIBBLE_OUTCOME <- list(
  "COMPLETE" = "Complete"
)


# Shooting summary for all teams in the dataset
team_shooting_stats <- function(data) {
  data %>%
    filter(type.name == ACTION_TYPE$SHOT) %>%
    group_by(team.name) %>%
    summarise(
      total_shots        = n(),
      total_goals        = sum(shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
      total_xg           = round(sum(shot.statsbomb_xg, na.rm = TRUE), 3),
      avg_xg_per_shot    = round(mean(shot.statsbomb_xg, na.rm = TRUE), 3),
      conversion_rate    = round(total_goals / total_shots * 100, 1),
      xg_overperformance = round(total_goals - total_xg, 3)
    ) %>%
    arrange(desc(total_xg)) %>%
    defactorise()
}

# Shooting breakdown by player for a specific team
player_shooting_stats <- function(data, team_name) {
  data %>%
    filter(type.name == ACTION_TYPE$SHOT, team.name == team_name) %>%
    group_by(player.name) %>%
    summarise(
      shots              = n(),
      goals              = sum(shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
      xg                 = round(sum(shot.statsbomb_xg, na.rm = TRUE), 3),
      avg_xg_per_shot    = round(mean(shot.statsbomb_xg, na.rm = TRUE), 3),
      xg_overperformance = round(goals - xg, 3)
    ) %>%
    arrange(desc(xg)) %>%
    defactorise()
}

# Pass accuracy summary for a team
pass_accuracy <- function(data, team_name) {
  data %>%
    filter(type.name == ACTION_TYPE$PASS, team.name == team_name) %>%
    summarise(
      total_passes = n(),
      completed    = sum(is.na(pass.outcome.name)),
      incomplete   = total_passes - completed,
      accuracy_pct = round(completed / total_passes * 100, 1),
      avg_length   = round(mean(pass.length, na.rm = TRUE), 1),
      key_passes   = sum(pass.shot_assist == TRUE | pass.goal_assist == TRUE, na.rm = TRUE)
    )
}

# Top passers by volume for a team, with accuracy and key passes
top_passers <- function(data, team_name, n = 10) {
  data %>%
    filter(type.name == ACTION_TYPE$PASS, team.name == team_name) %>%
    group_by(player.name) %>%
    summarise(
      passes       = n(),
      completed    = sum(is.na(pass.outcome.name)),
      accuracy_pct = round(completed / passes * 100, 1),
      avg_length   = round(mean(pass.length, na.rm = TRUE), 1),
      key_passes   = sum(pass.shot_assist == TRUE | pass.goal_assist == TRUE, na.rm = TRUE)
    ) %>%
    arrange(desc(passes)) %>%
    head(n) %>%
    defactorise()
}

# Shot locations + xG for a team (for front-end pitch map visualisation)
shot_map <- function(data, team_name) {
  data %>%
    filter(type.name == ACTION_TYPE$SHOT, team.name == team_name, !is.na(shot.statsbomb_xg)) %>%
    mutate(is_goal = shot.outcome.name == SHOT_OUTCOME$GOAL) %>%
    select(
      player       = player.name,
      minute,
      shot_outcome = shot.outcome.name,
      xg           = shot.statsbomb_xg,
      body_part    = shot.body_part.name,
      technique    = shot.technique.name,
      shot_type    = shot.type.name,
      is_goal,
      x            = location.x,
      y            = location.y
    ) %>%
    defactorise()
}

# Dribble success rate by player for a team
dribble_stats <- function(data, team_name) {
  data %>%
    filter(type.name == ACTION_TYPE$DRIBBLE, team.name == team_name) %>%
    group_by(player.name) %>%
    summarise(
      attempts    = n(),
      completed   = sum(dribble.outcome.name == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE),
      success_pct = round(completed / attempts * 100, 1)
    ) %>%
    arrange(desc(attempts)) %>%
    defactorise()
}

# Breakdown of how often each action type is performed under pressure
pressure_performance <- function(data, team_name) {
  data %>%
    filter(team.name == team_name, type.name %in% unlist(ACTION_TYPE)) %>%
    group_by(type.name) %>%
    summarise(
      total                = n(),
      under_pressure_count = sum(under_pressure == TRUE, na.rm = TRUE),
      pressure_pct         = round(under_pressure_count / total * 100, 1)
    ) %>%
    arrange(desc(pressure_pct)) %>%
    defactorise()
}

# Multi-team comparison — only includes teams with a full generated dataset
all_teams_overview <- function(data) {
  data %>%
    filter(team.name %in% dataset_teams) %>%
    group_by(team.name) %>%
    summarise(
      goals              = sum(type.name == ACTION_TYPE$SHOT & shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
      total_shots        = sum(type.name == ACTION_TYPE$SHOT),
      total_xg           = round(sum(shot.statsbomb_xg[type.name == ACTION_TYPE$SHOT], na.rm = TRUE), 2),
      conversion_rate    = round(goals / pmax(total_shots, 1) * 100, 1),
      xg_overperformance = round(goals - total_xg, 2),
      pass_accuracy      = round(sum(type.name == ACTION_TYPE$PASS & is.na(pass.outcome.name)) / pmax(sum(type.name == ACTION_TYPE$PASS), 1) * 100, 1),
      key_passes         = sum(type.name == ACTION_TYPE$PASS & (pass.shot_assist == TRUE | pass.goal_assist == TRUE), na.rm = TRUE),
      dribble_success    = round(sum(type.name == ACTION_TYPE$DRIBBLE & dribble.outcome.name == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE) / pmax(sum(type.name == ACTION_TYPE$DRIBBLE), 1) * 100, 1),
      pressure_pct       = round(sum(under_pressure == TRUE, na.rm = TRUE) / n() * 100, 1)
    ) %>%
    arrange(desc(total_xg)) %>%
    defactorise()
}

# High-level performance summary for a single team
team_overview <- function(data, team_name) {
  d        <- data %>% filter(team.name == team_name)
  shots    <- d %>% filter(type.name == ACTION_TYPE$SHOT)
  passes   <- d %>% filter(type.name == ACTION_TYPE$PASS)
  dribbles <- d %>% filter(type.name == ACTION_TYPE$DRIBBLE)
  actions  <- d %>% filter(type.name %in% unlist(ACTION_TYPE))

  n_shots    <- nrow(shots)
  n_passes   <- nrow(passes)
  n_dribbles <- nrow(dribbles)
  goals      <- sum(shots$shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE)
  total_xg   <- round(sum(shots$shot.statsbomb_xg, na.rm = TRUE), 2)

  data.frame(
    goals              = goals,
    total_shots        = n_shots,
    total_xg           = total_xg,
    conversion_rate    = if (n_shots > 0) round(goals / n_shots * 100, 1) else 0,
    xg_overperformance = round(goals - total_xg, 2),
    total_passes       = n_passes,
    pass_accuracy      = if (n_passes > 0) round(sum(is.na(passes$pass.outcome.name)) / n_passes * 100, 1) else 0,
    key_passes         = sum(passes$pass.shot_assist == TRUE | passes$pass.goal_assist == TRUE, na.rm = TRUE),
    dribble_attempts   = n_dribbles,
    dribble_success    = if (n_dribbles > 0) round(sum(dribbles$dribble.outcome.name == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE) / n_dribbles * 100, 1) else 0,
    pressure_pct       = if (nrow(actions) > 0) round(sum(actions$under_pressure == TRUE, na.rm = TRUE) / nrow(actions) * 100, 1) else 0
  )
}
