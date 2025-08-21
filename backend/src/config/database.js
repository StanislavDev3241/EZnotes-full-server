const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "clearlyai_db",
  user: process.env.DB_USER || "clearlyAI",
  password: process.env.DB_PASSWORD || "clearly_postgres",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2000ms to 10000ms
  // Add connection retry logic
  connectionRetryAttempts: 3,
  connectionRetryDelay: 1000,
});

// Test database connection
pool.on("connect", () => {
  console.log("📊 Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
  // Don't exit the process, let it retry
});

// Add connection health check
const healthCheck = async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    return false;
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🔄 Shutting down database connections...");
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🔄 Shutting down database connections...");
  await pool.end();
  process.exit(0);
});

// Initialize database tables
const initDatabase = async () => {
  try {
    // Users table - Updated to match init-db.sql schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        specialty VARCHAR(100),
        organization VARCHAR(200),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Files table - Updated to match init-db.sql schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        file_type VARCHAR(100),
        user_id INTEGER REFERENCES users(id),
        transcription TEXT,
        status VARCHAR(50) DEFAULT 'uploaded',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notes table - Updated to match init-db.sql schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id),
        user_id INTEGER REFERENCES users(id),
        note_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        parent_note_id INTEGER REFERENCES notes(id),
        prompt_used TEXT,
        ai_model VARCHAR(100),
        quality_score DECIMAL(3,2),
        status VARCHAR(50) DEFAULT 'generated',
        retention_date DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tasks table for queue management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id),
        user_id INTEGER REFERENCES users(id),
        task_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        priority INTEGER DEFAULT 1,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    // Custom prompts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_prompts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        prompt_text TEXT NOT NULL,
        specialty VARCHAR(100),
        is_public BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        success_rate DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat conversations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        note_id INTEGER REFERENCES notes(id),
        title VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES chat_conversations(id),
        sender_type VARCHAR(20) NOT NULL,
        message_text TEXT NOT NULL,
        ai_response TEXT,
        note_improvements JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Note improvements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS note_improvements (
        id SERIAL PRIMARY KEY,
        note_id INTEGER REFERENCES notes(id),
        conversation_id INTEGER REFERENCES chat_conversations(id),
        improvement_type VARCHAR(100),
        old_content TEXT,
        new_content TEXT,
        improvement_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
      CREATE INDEX IF NOT EXISTS idx_notes_file_id ON notes(file_id);
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    // Create admin user if not exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [process.env.ADMIN_EMAIL || "cmesmile50@gmail.com"]
    );

    if (adminCheck.rows.length === 0) {
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || "admin_secure_password_2024",
        10
      );

      await pool.query(
        `
        INSERT INTO users (email, password_hash, role, first_name, last_name, is_active) 
        VALUES ($1, $2, 'admin', 'Admin', 'User', true)
      `,
        [process.env.ADMIN_EMAIL || "cmesmile50@gmail.com", hashedPassword]
      );

      console.log("👑 Admin user created successfully");
    }

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    throw error;
  }
};

module.exports = { pool, initDatabase, healthCheck };
