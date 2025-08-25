#!/bin/bash

# Migration script to run inside Docker container
# This script runs the clinical context migration inside the backend container

echo "🚀 Running clinical context migration inside Docker container..."

# Check if we're inside a Docker container
if [ -f /.dockerenv ]; then
    echo "✅ Running inside Docker container"
else
    echo "⚠️  Not running inside Docker container, attempting to connect to external database..."
fi

# Set environment variables to match docker-compose.yml
export DB_HOST=${DB_HOST:-"localhost"}
export DB_PORT=${DB_PORT:-"5434"}
export DB_NAME=${DB_NAME:-"clearlyai_db"}
export DB_USER=${DB_USER:-"clearlyAI"}
export DB_PASSWORD=${DB_PASSWORD:-"clearly_postgres"}

echo "📊 Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Run the migration
echo "⚡ Executing migration..."
node run-clinical-context-migration.js

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
