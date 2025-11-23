#!/bin/sh
# Docker entrypoint script.

# Exit on fail
set -e

echo "Running database migrations..."
npm run migrate:run

echo "Starting server..."
exec "$@"
