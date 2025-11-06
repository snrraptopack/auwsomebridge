# Create Templates

This folder contains starter templates and a small CLI to scaffold them.

- `templates/hono/` — Hono runtime (Cloudflare Workers / Bun / Node)
- `templates/express/` — Express runtime (Node/Bun)

Publish the CLI:

```bash
npm publish ./create --access public
```

Use the CLI (non-interactive flags):

```bash
npm create auwsomebridge@latest my-app
```

This CLI does not prompt interactively to avoid Windows terminals spawning a separate Node window.
By default it uses Express; choose Hono explicitly with `--runtime hono`.

Local usage (without publishing):

1. Copy a template folder to a new directory.
2. Replace imports with `auwsomebridge` (single entrypoint).
3. Install `auwsomebridge` and the selected runtime (`express` or `hono`) plus `zod`.
4. Run the server using the provided scripts.

Runtime selection in code:

Express
```
const { middleware } = setupBridge(routes, { runtime: 'express' });
```

Hono
```
const { middleware } = setupBridge(routes, { runtime: 'hono' });
```

Notes:
- Runtime auto-detection works when only one runtime is installed; override with `runtime: 'express' | 'hono'` for clarity.
- See `../docs/02-getting-started.md` and `../docs/03-runtime-adapters.md` for details.