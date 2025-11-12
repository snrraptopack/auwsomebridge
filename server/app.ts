import express from 'express';
import { middleware } from './shared';
import path from 'path';

const app = express();
app.use(express.json());

// Mount the bridge middleware at /api/:route
app.use('/api/:route', middleware);

// Static test page
app.use(express.static(path.join(__dirname, '../test/express-sse')));

const port = 3000;
app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
