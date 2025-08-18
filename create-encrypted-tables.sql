-- Create Encrypted Tables for Save Notes Functionality
-- Run this on your server to fix the "relation does not exist" error

-- Table for encrypted saved notes
CREATE TABLE IF NOT EXISTS encrypted_saved_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  note_type VARCHAR(50) NOT NULL, -- 'soap_note', 'patient_summary', 'custom', 'complete_conversation'
  note_name VARCHAR(200) NOT NULL,
  encrypted_content TEXT NOT NULL,
  encryption_iv VARCHAR(32) NOT NULL,
  encryption_algorithm VARCHAR(20) DEFAULT 'aes-256-cbc',
  content_hash VARCHAR(64) NOT NULL, -- For integrity checking
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for chat history checkpoints
CREATE TABLE IF NOT EXISTS chat_history_checkpoints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE CASCADE,
  checkpoint_name VARCHAR(200),
  encrypted_messages TEXT NOT NULL, -- JSON array of encrypted messages
  encryption_iv VARCHAR(32) NOT NULL,
  encryption_algorithm VARCHAR(20) DEFAULT 'aes-256-cbc',
  messages_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for message edits (audit trail)
CREATE TABLE IF NOT EXISTS message_edits (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  encrypted_old_content TEXT NOT NULL,
  encrypted_new_content TEXT NOT NULL,
  encryption_iv VARCHAR(32) NOT NULL,
  encryption_algorithm VARCHAR(20) DEFAULT 'aes-256-cbc',
  edit_reason VARCHAR(500),
  edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for audit logging (HIPAA compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL, -- 'login', 'data_access', 'data_modify', 'encrypt', 'decrypt', 'save_note'
  resource_type VARCHAR(100), -- 'note', 'message', 'file', 'conversation'
  resource_id INTEGER,
  ip_address INET,
  user_agent TEXT,
  encrypted_details TEXT, -- For sensitive audit information
  encryption_iv VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_encrypted_saved_notes_user_id ON encrypted_saved_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_saved_notes_note_type ON encrypted_saved_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_chat_history_checkpoints_user_id ON chat_history_checkpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_message_edits_message_id ON message_edits(message_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
CREATE TRIGGER update_encrypted_saved_notes_updated_at 
    BEFORE UPDATE ON encrypted_saved_notes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE encrypted_saved_notes IS 'Encrypted storage for user-saved SOAP notes and patient summaries';
COMMENT ON TABLE chat_history_checkpoints IS 'Encrypted chat history checkpoints for conversation continuation';
COMMENT ON TABLE message_edits IS 'Audit trail for message edits with encrypted content';
COMMENT ON TABLE audit_logs IS 'HIPAA-compliant audit logging for all data access and modifications';

-- Show the created tables
\dt encrypted_*
\dt audit_logs 