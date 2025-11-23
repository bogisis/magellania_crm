#!/bin/sh
# Docker entrypoint script.

# Exit on fail
set -e

echo "Running database migrations..."
npm run db:migrate

echo "Starting server..."
exec "$@"
