import { middleware } from "../server/shared-bun";
import indexHtml from "./index.html";

Bun.serve({
  port: 3004,
  routes: {
    // Serve your Auwla app
     "/api":middleware,
    "/*": indexHtml,
  },
  development: {
    hmr: true,
  },
});

console.log("Server running at http://localhost:3004");
