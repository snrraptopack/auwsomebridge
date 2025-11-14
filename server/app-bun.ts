import { middleware } from './shared-bun';
import index from "../test/bun-sse/index.html";

// Bun.serve with bridge middleware (includes WebSocket support)
const server = Bun.serve({
  port: 3005,
  fetch: middleware.fetch,
  websocket: middleware.websocket,
});

console.log(`🚀 Bun API server listening at http://localhost:3005`);
console.log('Available routes:');
console.log('  GET  /api/ping');
console.log('  GET  /api/pingSse (SSE)');
console.log('  GET  /api/getUserById?id=<uuid>');
console.log('  POST /api/createUser');
console.log('  PATCH /api/updateUser');
console.log('  DELETE /api/deleteUser');
console.log('');
console.log('WebSocket support enabled for routes with kind: "ws"');

export default server;
