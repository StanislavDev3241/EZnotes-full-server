-- Migration: Add clinical context columns to chat_conversations table
-- This enables storing transcription, notes, and file context with conversations

-- Add new columns for clinical context
ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS clinical_context JSONB,
ADD COLUMN IF NOT EXISTS transcription TEXT,
ADD COLUMN IF NOT EXISTS file_id INTEGER REFERENCES files(id);

-- Add index for better performance when querying by file_id
CREATE INDEX IF NOT EXISTS idx_chat_conversations_file_id ON chat_conversations(file_id);

-- Add index for clinical context queries
CREATE INDEX IF NOT EXISTS idx_chat_conversations_clinical_context ON chat_conversations USING GIN (clinical_context);

-- Update existing conversations to have clinical context if they have note_id
UPDATE chat_conversations 
SET clinical_context = (
  SELECT json_build_object(
    'transcription', f.transcription,
    'notes', n.content,
    'fileName', f.filename,
    'noteType', n.note_type,
    'fileId', f.id,
    'status', 'completed'
  )
  FROM notes n
  LEFT JOIN files f ON n.file_id = f.id
  WHERE n.id = chat_conversations.note_id
),
transcription = (
  SELECT f.transcription
  FROM notes n
  LEFT JOIN files f ON n.file_id = f.id
  WHERE n.id = chat_conversations.note_id
),
file_id = (
  SELECT f.id
  FROM notes n
  LEFT JOIN files f ON n.file_id = f.id
  WHERE n.id = chat_conversations.note_id
)
WHERE note_id IS NOT NULL 
AND clinical_context IS NULL;

-- Add comment to document the new columns
COMMENT ON COLUMN chat_conversations.clinical_context IS 'JSON object containing transcription, notes, and file metadata for conversation context';
COMMENT ON COLUMN chat_conversations.transcription IS 'Original audio transcription for this conversation';
COMMENT ON COLUMN chat_conversations.file_id IS 'Reference to the original file for this conversation';
