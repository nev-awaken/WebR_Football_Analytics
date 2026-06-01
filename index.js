import express from 'express';
import { statsRoutes } from './routes/statsRoutes.js';
import { pingRoutes } from './routes/pingRoutes.js';
import { teamStatsRoutes } from './routes/teamStatsRoutes.js';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use("/stats", statsRoutes);
app.use("/team-stats", teamStatsRoutes);
app.use("/", pingRoutes);

// Catch All Route
app.all('*splat', (req, res) => {
  res.status(404).send('<h1>Page Not Found</h1><p>No matching routes</p>');
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});