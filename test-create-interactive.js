// Test the create command with simulated input
const { spawn } = require('child_process');

console.log('Testing create command with Bun selection...\n');

const child = spawn('node', ['create/bin.js', 'test-project-bun'], {
  stdio: ['pipe', 'inherit', 'inherit']
});

// Simulate user selecting option 3 (Bun)
setTimeout(() => {
  child.stdin.write('3\n');
  child.stdin.end();
}, 1000);

child.on('close', (code) => {
  console.log(`\nProcess exited with code ${code}`);
  
  // Check if project was created
  const fs = require('fs');
  if (fs.existsSync('test-project-bun')) {
    console.log('✅ Project created successfully!');
    console.log('\nCreated files:');
    const files = fs.readdirSync('test-project-bun', { recursive: true });
    files.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log('❌ Project creation failed');
  }
});
