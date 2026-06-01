import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { statsRoutes } from './routes/statsRoutes.js';
import { pingRoutes } from './routes/pingRoutes.js';
import { teamStatsRoutes } from './routes/teamStatsRoutes.js';

const app  = express();
const port = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — try again in a minute" }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static('public'));
app.use("/stats",      limiter, statsRoutes);
app.use("/team-stats", limiter, teamStatsRoutes);
app.use("/",           pingRoutes);

// Catch All Route
app.all('*splat', (req, res) => {
  res.status(404).send('<h1>Page Not Found</h1><p>No matching routes</p>');
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});