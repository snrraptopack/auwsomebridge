#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(`\nUsage: npm create auwsomebridge@latest [target-dir] [--runtime express|hono|bun]\n`);
  console.log(`Interactive Mode (prompts for runtime):`);
  console.log(`  npm create auwsomebridge@latest my-app`);
  console.log(`\nDirect Mode (skip prompt):`);
  console.log(`  npm create auwsomebridge@latest my-app --runtime express`);
  console.log(`  npm create auwsomebridge@latest my-app --runtime hono`);
  console.log(`  npm create auwsomebridge@latest my-app --runtime bun`);
  console.log(`\nFlags:`);
  console.log(`  --runtime, -r   Set 'express', 'hono', or 'bun' (prompts if not set)`);
  console.log(`  --express       Shortcut for --runtime express`);
  console.log(`  --hono          Shortcut for --runtime hono`);
  console.log(`  --bun           Shortcut for --runtime bun`);
  console.log(`  --help, -h      Show this help message`);
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
    if (a === '--bun') {
      runtime = 'bun';
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
  const valid = ['express', 'hono', 'bun'];
  if (!valid.includes(runtime)) {
    console.error(`Invalid runtime: ${runtime}. Choose 'express', 'hono', or 'bun'.`);
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

function promptRuntime() {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🚀 Choose your runtime:');
    console.log('  1) Express (Node.js)');
    console.log('  2) Hono (Edge-ready)');
    console.log('  3) Bun (Native & Fast)');
    
    rl.question('\nEnter your choice (1-3) [default: 1]: ', (answer) => {
      rl.close();
      const choice = answer.trim() || '1';
      
      switch (choice) {
        case '1':
        case 'express':
          resolve('express');
          break;
        case '2':
        case 'hono':
          resolve('hono');
          break;
        case '3':
        case 'bun':
          resolve('bun');
          break;
        default:
          console.log('Invalid choice, defaulting to Express');
          resolve('express');
      }
    });
  });
}

async function main() {
  const { targetDir, runtime: runtimeArg } = parseArgs();
  
  // If no runtime specified, prompt the user
  let runtime;
  if (runtimeArg) {
    runtime = runtimeArg;
    ensureValidRuntime(runtime);
  } else {
    runtime = await promptRuntime();
  }

  const srcDir = path.join(__dirname, 'templates', runtime);
  if (!fs.existsSync(srcDir)) {
    console.error(`Template not found: ${srcDir}`);
    process.exit(1);
  }

  const destDir = path.resolve(process.cwd(), targetDir);
  fs.mkdirSync(destDir, { recursive: true });

  copyRecursive(srcDir, destDir);

  console.log(`\n✅ Scaffolded auwsomebridge (${runtime}) into: ${destDir}`);
  console.log(`\n📦 Next steps:`);
  console.log(`  cd ${targetDir !== '.' ? targetDir : 'your-project'}`);
  
  if (runtime === 'bun') {
    console.log(`  bun install`);
    console.log(`\n🚀 Start the server:`);
    console.log(`  bun run server`);
  } else {
    console.log(`  npm install`);
    if (runtime === 'express') {
      console.log(`  npm install express auwsomebridge zod`);
    } else if (runtime === 'hono') {
      console.log(`  npm install hono auwsomebridge zod`);
    }
    console.log(`\n🚀 Start the server:`);
    console.log(`  npm run server:${runtime}`);
  }
  
  if (!runtimeArg) {
    console.log(`\n💡 Tip: Next time you can skip the prompt with --runtime ${runtime}`);
  }
  console.log(`\n📚 Visit https://github.com/snrraptopack/auwsomebridge for documentation`);
}

main();