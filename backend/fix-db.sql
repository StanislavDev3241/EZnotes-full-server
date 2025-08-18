-- Simple Database Fix for ClearlyAI
-- This adds only the essential missing columns

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing users with default values
UPDATE users SET first_name = 'User', last_name = 'Name', is_active = true;

-- Make columns NOT NULL
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;

-- Add missing columns to files table
ALTER TABLE files ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Add missing columns to notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS prompt_used TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);

-- Create basic tables for chat system
CREATE TABLE IF NOT EXISTS chat_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  note_id INTEGER REFERENCES notes(id),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES chat_conversations(id),
  sender_type VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  ai_response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Show the updated schema
\d users 