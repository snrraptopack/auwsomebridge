#!/bin/bash
# Test the create command for Bun

echo "Testing create command with Bun runtime..."
node create/bin.js test-bun-project --bun

if [ -d "test-bun-project" ]; then
  echo "✅ Project created successfully!"
  echo "Contents:"
  ls -la test-bun-project/
  echo ""
  echo "Server file:"
  cat test-bun-project/server/app-bun.ts
else
  echo "❌ Project creation failed"
fi
