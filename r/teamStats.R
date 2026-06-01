library(data.table)

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
  dt     <- as.data.table(data)[type.name == ACTION_TYPE$SHOT]
  result <- dt[, .(
    total_shots     = .N,
    total_goals     = sum(shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
    total_xg        = round(sum(shot.statsbomb_xg, na.rm = TRUE), 3),
    avg_xg_per_shot = round(mean(shot.statsbomb_xg, na.rm = TRUE), 3)
  ), by = team.name]
  result[, conversion_rate    := round(total_goals / total_shots * 100, 1)]
  result[, xg_overperformance := round(total_goals - total_xg, 3)]
  result[order(-total_xg)]
}

# Shooting breakdown by player for a specific team
player_shooting_stats <- function(data, team_name) {
  dt     <- as.data.table(data)[type.name == ACTION_TYPE$SHOT & team.name == team_name]
  result <- dt[, .(
    shots           = .N,
    goals           = sum(shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
    xg              = round(sum(shot.statsbomb_xg, na.rm = TRUE), 3),
    avg_xg_per_shot = round(mean(shot.statsbomb_xg, na.rm = TRUE), 3)
  ), by = player.name]
  result[, xg_overperformance := round(goals - xg, 3)]
  result[order(-xg)]
}

# Pass accuracy summary for a team
pass_accuracy <- function(data, team_name) {
  dt <- as.data.table(data)[type.name == ACTION_TYPE$PASS & team.name == team_name]
  dt[, .(
    total_passes = .N,
    completed    = sum(is.na(pass.outcome.name)),
    incomplete   = .N - sum(is.na(pass.outcome.name)),
    accuracy_pct = round(sum(is.na(pass.outcome.name)) / .N * 100, 1),
    avg_length   = round(mean(pass.length, na.rm = TRUE), 1),
    key_passes   = sum(pass.shot_assist == TRUE | pass.goal_assist == TRUE, na.rm = TRUE)
  )]
}

# Top passers by volume for a team, with accuracy and key passes
top_passers <- function(data, team_name, n = 10) {
  dt     <- as.data.table(data)[type.name == ACTION_TYPE$PASS & team.name == team_name]
  result <- dt[, .(
    passes     = .N,
    completed  = sum(is.na(pass.outcome.name)),
    avg_length = round(mean(pass.length, na.rm = TRUE), 1),
    key_passes = sum(pass.shot_assist == TRUE | pass.goal_assist == TRUE, na.rm = TRUE)
  ), by = player.name]
  result[, accuracy_pct := round(completed / passes * 100, 1)]
  head(result[order(-passes)], n)
}

# Shot locations + xG for a team (for front-end pitch map visualisation)
shot_map <- function(data, team_name) {
  dt <- as.data.table(data)[type.name == ACTION_TYPE$SHOT & team.name == team_name & !is.na(shot.statsbomb_xg)]
  dt[, is_goal := shot.outcome.name == SHOT_OUTCOME$GOAL]
  dt[, .(
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
  )]
}

# Dribble success rate by player for a team
dribble_stats <- function(data, team_name) {
  dt     <- as.data.table(data)[type.name == ACTION_TYPE$DRIBBLE & team.name == team_name]
  result <- dt[, .(
    attempts  = .N,
    completed = sum(dribble.outcome.name == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE)
  ), by = player.name]
  result[, success_pct := round(completed / attempts * 100, 1)]
  result[order(-attempts)]
}

# Breakdown of how often each action type is performed under pressure
pressure_performance <- function(data, team_name) {
  dt     <- as.data.table(data)[team.name == team_name & type.name %in% unlist(ACTION_TYPE)]
  result <- dt[, .(
    total                = .N,
    under_pressure_count = sum(under_pressure == TRUE, na.rm = TRUE)
  ), by = type.name]
  result[, pressure_pct := round(under_pressure_count / total * 100, 1)]
  result[order(-pressure_pct)]
}

# Multi-team comparison — only includes teams with a full generated dataset
all_teams_overview <- function(data) {
  dt <- as.data.table(data)[team.name %in% dataset_teams]
  result <- dt[, .(
    goals              = sum(type.name == ACTION_TYPE$SHOT & shot.outcome.name == SHOT_OUTCOME$GOAL, na.rm = TRUE),
    total_shots        = sum(type.name == ACTION_TYPE$SHOT),
    total_xg           = round(sum(shot.statsbomb_xg[type.name == ACTION_TYPE$SHOT], na.rm = TRUE), 2),
    n_passes           = sum(type.name == ACTION_TYPE$PASS),
    completed_passes   = sum(type.name == ACTION_TYPE$PASS & is.na(pass.outcome.name)),
    key_passes         = sum(type.name == ACTION_TYPE$PASS & (pass.shot_assist == TRUE | pass.goal_assist == TRUE), na.rm = TRUE),
    n_dribbles         = sum(type.name == ACTION_TYPE$DRIBBLE),
    completed_dribbles = sum(type.name == ACTION_TYPE$DRIBBLE & dribble.outcome.name == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE),
    pressure_count     = sum(under_pressure == TRUE, na.rm = TRUE),
    total_actions      = .N
  ), by = team.name]

  result[, conversion_rate    := round(goals / pmax(total_shots, 1) * 100, 1)]
  result[, xg_overperformance := round(goals - total_xg, 2)]
  result[, pass_accuracy      := round(completed_passes / pmax(n_passes, 1) * 100, 1)]
  result[, dribble_success    := round(completed_dribbles / pmax(n_dribbles, 1) * 100, 1)]
  result[, pressure_pct       := round(pressure_count / pmax(total_actions, 1) * 100, 1)]

  result[order(-total_xg), .(
    team.name, goals, total_shots, total_xg,
    conversion_rate, xg_overperformance,
    pass_accuracy, key_passes,
    dribble_success, pressure_pct
  )]
}

# High-level performance summary for a single team
team_overview <- function(data, team_name) {
  dt       <- as.data.table(data)[team.name == team_name]
  shots    <- dt[type.name == ACTION_TYPE$SHOT]
  passes   <- dt[type.name == ACTION_TYPE$PASS]
  dribbles <- dt[type.name == ACTION_TYPE$DRIBBLE]
  actions  <- dt[type.name %in% unlist(ACTION_TYPE)]

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
