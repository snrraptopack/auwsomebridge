#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(`\nUsage: npm create auwsomebridge@latest [target-dir] [--runtime express|hono]\n`);
  console.log(`Examples:`);
  console.log(`  npm create auwsomebridge@latest my-app --runtime express`);
  console.log(`  npm create auwsomebridge@latest my-app --runtime hono`);
  console.log(`\nFlags:`);
  console.log(`  --runtime, -r   Set 'express' or 'hono' (defaults to express)`);
  console.log(`  --express       Shortcut for --runtime express`);
  console.log(`  --hono          Shortcut for --runtime hono`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let runtime; // explicit flags or default to express
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--runtime' || a === '-r') {
      runtime = args[i + 1];
      i++;
      continue;
    }
    if (a === '--express') {
      runtime = 'express';
      continue;
    }
    if (a === '--hono') {
      runtime = 'hono';
      continue;
    }
    // First non-flag arg is target dir
    if (!a.startsWith('-')) {
      targetDir = a;
    }
  }
  return { targetDir, runtime };
}

function ensureValidRuntime(runtime) {
  const valid = ['express', 'hono'];
  if (!valid.includes(runtime)) {
    console.error(`Invalid runtime: ${runtime}. Choose 'express' or 'hono'.`);
    process.exit(1);
  }
}

// No interactive prompts; use flags or default to express

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const s = path.join(src, entry);
      const d = path.join(dest, entry);
      copyRecursive(s, d);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  const { targetDir, runtime: runtimeArg } = parseArgs();
  const runtime = runtimeArg || 'express';
  ensureValidRuntime(runtime);

  const srcDir = path.join(__dirname, 'templates', runtime);
  if (!fs.existsSync(srcDir)) {
    console.error(`Template not found: ${srcDir}`);
    process.exit(1);
  }

  const destDir = path.resolve(process.cwd(), targetDir);
  fs.mkdirSync(destDir, { recursive: true });

  copyRecursive(srcDir, destDir);

  console.log(`\nScaffolded auwsomebridge (${runtime}) into: ${destDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${targetDir}`);
  console.log(`  npm install`);
  console.log(`  npm install ${runtime} auwsomebridge zod`);
  if (!runtimeArg) {
    console.log(`\nNote: Defaulting to Express. To choose Hono, re-run with --runtime hono`);
  }
  console.log(`\nThen run your server according to the template's README.`);
}

main();