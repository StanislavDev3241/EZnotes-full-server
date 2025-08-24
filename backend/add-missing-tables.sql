-- Add missing tables to existing database

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  details JSONB,
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

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_history_checkpoints_user_id ON chat_history_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_checkpoints_conversation_id ON chat_history_checkpoints(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_checkpoints_created_at ON chat_history_checkpoints(created_at); 