#!/usr/bin/env node

/**
 * Clinical Context Migration Script
 *
 * This script adds clinical context columns to the chat_conversations table
 * to enable storing transcription, notes, and file context with conversations.
 *
 * Usage: node run-clinical-context-migration.js
 */

const { Pool } = require("pg");
const fs = require("fs").promises;
const path = require("path");

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "clearlyai_db",
  user: process.env.DB_USER || "clearlyAI",
  password: process.env.DB_PASSWORD || "clearly_postgres",
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting clinical context migration...");

    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      "add-clinical-context-columns.sql"
    );
    const migrationSQL = await fs.readFile(migrationPath, "utf8");

    console.log("📄 Migration SQL loaded");

    // Execute the migration
    console.log("⚡ Executing migration...");
    await client.query(migrationSQL);

    console.log("✅ Migration completed successfully!");

    // Verify the migration
    console.log("🔍 Verifying migration...");
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'chat_conversations'
      AND column_name IN ('clinical_context', 'transcription', 'file_id')
      ORDER BY column_name
    `);

    console.log("📊 Migration verification results:");
    result.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`
      );
    });

    // Check how many conversations were updated
    const updateResult = await client.query(`
      SELECT COUNT(*) as updated_count
      FROM chat_conversations
      WHERE clinical_context IS NOT NULL
    `);

    console.log(
      `📈 Conversations with clinical context: ${updateResult.rows[0].updated_count}`
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("🎉 Migration script completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = { runMigration };
