import { middleware } from './shared-bun';
import index from "../manual-test/index.html"

// Bun.serve with bridge middleware
Bun.serve({
  port: 3000,
  fetch: middleware,
  routes:{
    "/*": index
  }
});

console.log(`🚀 Bun API server listening at http://localhost:3000`);
console.log('Available routes:');
console.log('  GET  /api/ping');
console.log('  GET  /api/getUserById?id=<uuid>');
console.log('  POST /api/createUser');
console.log('  PATCH /api/updateUser');
console.log('  DELETE /api/deleteUser');
