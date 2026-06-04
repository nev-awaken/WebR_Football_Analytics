import express from 'express';
import { predictXg } from '../controllers/xgController.js';

const router = express.Router();

router.get('/predict', predictXg);

export const xgRoutes = router;