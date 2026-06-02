import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { statsRoutes } from './routes/statsRoutes.js';
import { pingRoutes } from './routes/pingRoutes.js';
import { teamStatsRoutes } from './routes/teamStatsRoutes.js';
import { startMonitor } from './helpers/monitor.js';

const app  = express();
const port = process.env.PORT || 3000;
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — try again in a minute" }
});

const rateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true';
if (rateLimitDisabled) console.log("Rate limiting disabled (DISABLE_RATE_LIMIT=true)");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static('public'));
app.use("/stats",      ...(rateLimitDisabled ? [] : [limiter]), statsRoutes);
app.use("/team-stats", ...(rateLimitDisabled ? [] : [limiter]), teamStatsRoutes);
app.use("/",           pingRoutes);

// Catch All Route
app.all('*splat', (req, res) => {
  res.status(404).send('<h1>Page Not Found</h1><p>No matching routes</p>');
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

startMonitor();