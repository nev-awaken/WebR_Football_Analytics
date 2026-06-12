import express from 'express';
import * as matchOutcome from '../controllers/matchOutcomeController.js';

// DOMAIN: football match-outcome prediction. Kept separate from xgRoutes.
const router = express.Router();

router.get('/model',    matchOutcome.getModel);   // trained + back-tested ratings
router.get('/simulate', matchOutcome.simulate);   // ?home=&away=&n= Monte-Carlo a fixture

export const matchOutcomeRoutes = router;
