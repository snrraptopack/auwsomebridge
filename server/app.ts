import express from 'express';
import { middleware } from './shared';

const app = express();
app.use(express.json());

// Mount the bridge middleware at /api/:route
app.use('/api/:route', middleware);

const port = 3000;
app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});