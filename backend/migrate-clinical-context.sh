#!/bin/bash

# Direct SQL migration script using psql
# This script connects directly to PostgreSQL and runs the migration

echo "🚀 Running clinical context migration with psql..."

# Database configuration
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"5434"}
DB_NAME=${DB_NAME:-"clearlyai_db"}
DB_USER=${DB_USER:-"clearlyAI"}
DB_PASSWORD=${DB_PASSWORD:-"clearly_postgres"}

echo "📊 Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql command not found. Please install PostgreSQL client tools."
    echo "   On Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "   On CentOS/RHEL: sudo yum install postgresql"
    exit 1
fi

# Set password environment variable for psql
export PGPASSWORD="$DB_PASSWORD"

echo "⚡ Executing migration with psql..."

# Run the migration SQL file
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f add-clinical-context-columns.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
    
    # Verify the migration
    echo "🔍 Verifying migration..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'chat_conversations'
    AND column_name IN ('clinical_context', 'transcription', 'file_id')
    ORDER BY column_name;
    "
    
    # Check how many conversations were updated
    echo "📈 Checking updated conversations..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT COUNT(*) as updated_count
    FROM chat_conversations
    WHERE clinical_context IS NOT NULL;
    "
    
else
    echo "❌ Migration failed!"
    exit 1
fi

# Clear password from environment
unset PGPASSWORD

echo "🎉 Migration script completed!"
