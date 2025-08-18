-- Database Migration Script for ClearlyAI
-- This script updates the existing database schema to match the new requirements

-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS specialty VARCHAR(100),
ADD COLUMN IF NOT EXISTS organization VARCHAR(200),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add missing columns to files table
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Add missing columns to notes table
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_note_id INTEGER REFERENCES notes(id),
ADD COLUMN IF NOT EXISTS prompt_used TEXT,
ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100),
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2);

-- Create custom_prompts table if it doesn't exist
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
);

-- Create chat_conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  note_id INTEGER REFERENCES notes(id),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES chat_conversations(id),
  sender_type VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  ai_response TEXT,
  note_improvements JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create note_improvements table if it doesn't exist
CREATE TABLE IF NOT EXISTS note_improvements (
  id SERIAL PRIMARY KEY,
  note_id INTEGER REFERENCES notes(id),
  user_id INTEGER REFERENCES users(id),
  improvement_type VARCHAR(50) NOT NULL,
  original_content TEXT,
  improved_content TEXT,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create prompt_feedback table if it doesn't exist
CREATE TABLE IF NOT EXISTS prompt_feedback (
  id SERIAL PRIMARY KEY,
  prompt_id INTEGER REFERENCES custom_prompts(id),
  user_id INTEGER REFERENCES users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update existing users to have default values for new columns
UPDATE users 
SET first_name = 'User', 
    last_name = 'Name', 
    is_active = true 
WHERE first_name IS NULL OR last_name IS NULL;

-- Make first_name and last_name NOT NULL after setting defaults
ALTER TABLE users 
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_prompts_user_id ON custom_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);

-- Display current schema
\d users
\d files
\d notes 