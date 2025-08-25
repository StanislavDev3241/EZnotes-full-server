-- Check and create missing tables for chat functionality

-- Check if note_improvements table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'note_improvements') THEN
        CREATE TABLE note_improvements (
            id SERIAL PRIMARY KEY,
            note_id INTEGER REFERENCES notes(id),
            conversation_id INTEGER REFERENCES chat_conversations(id),
            improvement_type VARCHAR(100),
            old_content TEXT,
            new_content TEXT,
            improvement_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'Created note_improvements table';
    ELSE
        RAISE NOTICE 'note_improvements table already exists';
    END IF;
END $$;

-- Check if chat_conversations table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_conversations') THEN
        CREATE TABLE chat_conversations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            note_id INTEGER REFERENCES notes(id),
            title VARCHAR(200),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'Created chat_conversations table';
    ELSE
        RAISE NOTICE 'chat_conversations table already exists';
    END IF;
END $$;

-- Check if chat_messages table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
        CREATE TABLE chat_messages (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER REFERENCES chat_conversations(id),
            sender_type VARCHAR(20) NOT NULL,
            message_text TEXT NOT NULL,
            ai_response TEXT,
            note_improvements JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'Created chat_messages table';
    ELSE
        RAISE NOTICE 'chat_messages table already exists';
    END IF;
END $$;

-- Check if chat_history_checkpoints table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'chat_history_checkpoints') THEN
        CREATE TABLE chat_history_checkpoints (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER REFERENCES chat_conversations(id),
            user_id INTEGER REFERENCES users(id),
            name VARCHAR(200) NOT NULL,
            messages JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'Created chat_history_checkpoints table';
    ELSE
        RAISE NOTICE 'chat_history_checkpoints table already exists';
    END IF;
END $$;

-- Show table status
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('note_improvements', 'chat_conversations', 'chat_messages', 'chat_history_checkpoints') 
        THEN 'Chat-related table'
        ELSE 'Other table'
    END as table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('note_improvements', 'chat_conversations', 'chat_messages', 'chat_history_checkpoints')
ORDER BY table_name; 