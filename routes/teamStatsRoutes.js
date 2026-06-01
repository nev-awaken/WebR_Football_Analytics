import express from 'express';
import * as teamStats from '../controllers/teamStatsController.js';

const router = express.Router();

router.get("/datasets",          teamStats.getDatasets);
router.get("/overview/:team",    teamStats.teamOverview);
router.get("/shooting",          teamStats.teamShootingStats);
router.get("/shooting/:team",    teamStats.playerShootingStats);
router.get("/passing/:team",     teamStats.teamPassAccuracy);
router.get("/top-passers/:team", teamStats.topPassers);
router.get("/shot-map/:team",    teamStats.shotMap);
router.get("/dribbles/:team",    teamStats.dribbleStats);
router.get("/pressure/:team",    teamStats.pressurePerformance);

export const teamStatsRoutes = router;
