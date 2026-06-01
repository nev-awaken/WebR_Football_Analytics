xg_per_shot <- function(xg) mean(xg, na.rm = TRUE)

ACTION_TYPE <- list(
    "PASS" = "Pass",
    "CARRY" = "Carry",
    "DRIBBLE" = "Dribble",
    "SHOT" = "Shot"
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
    filter(type == "Shot") %>%
    group_by(team) %>%
    summarise(
      total_shots        = n(),
      total_goals        = sum(shot_outcome == SHOT_OUTCOME$GOAL, na.rm = TRUE),
      total_xg           = round(sum(shot_statsbomb_xg, na.rm = TRUE), 3),
      avg_xg_per_shot    = round(mean(shot_statsbomb_xg, na.rm = TRUE), 3),
      conversion_rate    = round(total_goals / total_shots * 100, 1),
      xg_overperformance = round(total_goals - total_xg, 3)
    ) %>%
    arrange(desc(total_xg))
}

# Shooting breakdown by player for a specific team
player_shooting_stats <- function(data, team_name) {
  data %>%
    filter(type == ACTION_TYPE$SHOT, team == team_name) %>%
    group_by(player) %>%
    summarise(
      shots              = n(),
      goals              = sum(shot_outcome == SHOT_OUTCOME$GOAL, na.rm = TRUE),
      xg                 = round(sum(shot_statsbomb_xg, na.rm = TRUE), 3),
      avg_xg_per_shot    = round(mean(shot_statsbomb_xg, na.rm = TRUE), 3),
      xg_overperformance = round(goals - xg, 3)
    ) %>%
    arrange(desc(xg))
}

# Pass accuracy summary for a team
pass_accuracy <- function(data, team_name) {
  data %>%
    filter(type == ACTION_TYPE$PASS, team == team_name) %>%
    summarise(
      total_passes = n(),
      completed    = sum(is.na(pass_outcome) | pass_outcome == "", na.rm = FALSE),
      incomplete   = total_passes - completed,
      accuracy_pct = round(completed / total_passes * 100, 1),
      avg_length   = round(mean(as.numeric(pass_length), na.rm = TRUE), 1),
      key_passes   = sum(pass_shot_assist %in% c("True", TRUE) | pass_goal_assist %in% c("True", TRUE), na.rm = TRUE)
    )
}

# Top passers by volume for a team, with accuracy and key passes
top_passers <- function(data, team_name, n = 10) {
  data %>%
    filter(type == ACTION_TYPE$PASS, team == team_name) %>%
    group_by(player) %>%
    summarise(
      passes       = n(),
      completed    = sum(is.na(pass_outcome) | pass_outcome == ""),
      accuracy_pct = round(completed / passes * 100, 1),
      avg_length   = round(mean(as.numeric(pass_length), na.rm = TRUE), 1),
      key_passes   = sum(pass_shot_assist %in% c("True", TRUE) | pass_goal_assist %in% c("True", TRUE), na.rm = TRUE)
    ) %>%
    arrange(desc(passes)) %>%
    head(n)
}

# Shot locations + xG for a team (for front-end pitch map visualisation)
shot_map <- function(data, team_name) {
  data %>%
    filter(type == ACTION_TYPE$SHOT, team == team_name, !is.na(shot_statsbomb_xg)) %>%
    mutate(
      x       = as.numeric(sub("\\[([0-9.]+),.*",       "\\1", location)),
      y       = as.numeric(sub(".*,\\s*([0-9.]+)\\]",   "\\1", location)),
      is_goal = shot_outcome == SHOT_OUTCOME$GOAL
    ) %>%
    select(player, minute, shot_outcome, shot_statsbomb_xg, shot_body_part, shot_technique, shot_type, is_goal, x, y)
}

# Dribble success rate by player for a team
dribble_stats <- function(data, team_name) {
  data %>%
    filter(type == ACTION_TYPE$DRIBBLE, team == team_name) %>%
    group_by(player) %>%
    summarise(
      attempts    = n(),
      completed   = sum(dribble_outcome == DRIBBLE_OUTCOME$COMPLETE, na.rm = TRUE),
      success_pct = round(completed / attempts * 100, 1)
    ) %>%
    arrange(desc(attempts))
}

# Breakdown of how often each action type is performed under pressure
pressure_performance <- function(data, team_name) {
  data %>%
    filter(team == team_name, type %in% c(
        ACTION_TYPE$PASS, 
        ACTION_TYPE$CARRY, 
        ACTION_TYPE$DRIBBLE, 
        ACTION_TYPE$SHOT
      )
    ) %>%
    group_by(type) %>%
    summarise(
      total                = n(),
      under_pressure_count = sum(under_pressure %in% c("True", TRUE), na.rm = TRUE),
      pressure_pct         = round(under_pressure_count / total * 100, 1)
    ) %>%
    arrange(desc(pressure_pct))
}
