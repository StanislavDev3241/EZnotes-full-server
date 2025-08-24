-- ClearlyAI Database Initialization Script

-- Create tables
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
);

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
);

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
);

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
);

-- Create custom prompts table
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

-- Create chat conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  note_id INTEGER REFERENCES notes(id),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES chat_conversations(id),
  sender_type VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  ai_response TEXT,
  note_improvements JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create note improvements table
CREATE TABLE IF NOT EXISTS note_improvements (
  id SERIAL PRIMARY KEY,
  note_id INTEGER REFERENCES notes(id),
  conversation_id INTEGER REFERENCES chat_conversations(id),
  improvement_type VARCHAR(100),
  old_content TEXT,
  new_content TEXT,
  improvement_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  encrypted_details TEXT,
  encryption_iv TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat history checkpoints table
CREATE TABLE IF NOT EXISTS chat_history_checkpoints (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES chat_conversations(id),
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  messages JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin user with updated credentials
-- Email: cmesmile50@gmail.com
-- Password: clearly2025
INSERT INTO users (email, password_hash, role) 
VALUES ('cmesmile50@gmail.com', '$2a$10$vilAB8CGWHQwlHEvwunl8uRUd//prjPIeMrVeRQ2NEyrlUmUqDIiG', 'admin')
ON CONFLICT (email) DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  updated_at = CURRENT_TIMESTAMP; 