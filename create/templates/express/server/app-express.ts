import express from 'express';
import { composeRoutes, setupBridge } from 'auwsomebridge';

import { userRoutes } from './routes/user';

const routes = composeRoutes(userRoutes);
const { middleware } = setupBridge(routes, {
  prefix: '/api',
  validateResponses: true,
  // Explicitly select Express runtime (optional; autodetect works if express is installed)
  runtime: 'express',
});

const app = express();
app.use('/api/:route', middleware);

app.listen(3000, () => {
  console.log('Express server listening on http://localhost:3000');
});