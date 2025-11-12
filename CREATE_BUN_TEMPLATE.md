# Bun Template Added to Create Command

## What Was Added

### 1. Bun Template Files
- ✅ `create/templates/bun/package.json` - Bun-specific dependencies
- ✅ `create/templates/bun/server/app-bun.ts` - Bun server setup
- ✅ `create/templates/bun/server/routes/user.ts` - Example routes
- ✅ `create/templates/bun/README.md` - Bun template documentation

### 2. Updated Create Script (`create/bin.js`)
- ✅ Added Bun as a runtime option
- ✅ Added interactive prompt to choose runtime
- ✅ Added `--bun` flag shortcut
- ✅ Updated help text with all three runtimes
- ✅ Fixed terminal issues by using simple readline (no external dependencies)

## How to Use

### Interactive Mode (Recommended)
```bash
npm create auwsomebridge@latest my-app
```
This will prompt you to choose:
```
🚀 Choose your runtime:
  1) Express (Node.js)
  2) Hono (Edge-ready)
  3) Bun (Native & Fast)

Enter your choice (1-3) [default: 1]:
```

### Direct Mode (Skip Prompt)
```bash
# Using flag
npm create auwsomebridge@latest my-app --runtime bun

# Using shortcut
npm create auwsomebridge@latest my-app --bun
```

## What Gets Created

When you choose Bun, it creates:

```
my-app/
├── package.json          # Bun dependencies
├── README.md             # Getting started guide
└── server/
    ├── app-bun.ts        # Bun server entry point
    └── routes/
        └── user.ts       # Example routes
```

## Example Output

```bash
$ npm create auwsomebridge@latest my-bun-app --bun

✅ Scaffolded auwsomebridge (bun) into: /path/to/my-bun-app

📦 Next steps:
  cd my-bun-app
  bun install

🚀 Start the server:
  bun run server

📚 Visit https://github.com/snrraptopack/auwsomebridge for documentation
```

## Features of Bun Template

- **Zero Dependencies**: Uses Bun's native HTTP server
- **Fast**: Bun's native performance
- **Type-Safe**: Full TypeScript + Zod validation
- **Hot Reload**: `bun run dev` for auto-reload
- **Simple**: Minimal boilerplate

## Comparison

| Feature | Express | Hono | Bun |
|---------|---------|------|-----|
| Runtime | Node.js | Any | Bun |
| Dependencies | express | hono | None |
| Performance | Good | Great | Excellent |
| Edge Ready | No | Yes | No |
| Native HTTP | No | No | Yes |

## Terminal Issue Fix

The previous version had issues with interactive prompts opening new terminals. This was fixed by:
1. Using Node's built-in `readline` module (no external deps)
2. Simple single-question prompt (no complex UI)
3. Graceful fallback to default if invalid input
4. Option to skip prompt entirely with flags

This ensures the prompt works reliably across all terminals (PowerShell, CMD, Bash, etc.)
