#!/bin/sh
set -eu

# Apply the deployment URLs to the PWA worker without rebuilding the app.
node /app/docker-runtime-config.mjs

echo "Starting Alexandrie on ${HOST:-0.0.0.0}:${PORT:-8200}..."
exec node /app/.output/server/index.mjs
