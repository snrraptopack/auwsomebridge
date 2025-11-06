# Create Templates

This folder contains starter templates for projects using your bridge.

- `templates/hono/` — Hono runtime (Cloudflare Workers / Bun / Node)
- `templates/express/` — Express runtime (Node/Bun)

How to use locally (without publishing):

1. Copy a template folder to a new directory.
2. Replace imports with your published package name `auwsomebridge` (single entrypoint).
3. Install dependencies as listed in the template `package.json`.
4. Run the server using the provided scripts.

The bridge auto-detects the runtime (Express or Hono) based on installed dependencies, so you only need to install your chosen server (`express` or `hono`) and `auwsomebridge`.

You can also explicitly select a runtime in code:

Express
```
const { middleware } = setupBridge(routes, { runtime: 'express' });
```

Hono
```
const { middleware } = setupBridge(routes, { runtime: 'hono' });
```

When publishing an initializer, wire these templates into your `create-auwsomebridge` CLI and install the selected runtime plus `auwsomebridge` based on the user’s choice.