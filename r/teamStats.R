
avg_xg_per_shot_by_team <- function(data){
    data %>%
        filter(!is.na(shot_statsbomb_xg)) %>%
        group_by(team) %>%
        summarise(
            avg_xg_per_shot = xg_per_shot(shot_statsbomb_xg),
            total_xg        = sum(shot_statsbomb_xg),
            total_shots     = sum(!is.na(shot_outcome) & shot_outcome != ""),
            total_goals     = sum(shot_outcome == "Goal")
        )
}
