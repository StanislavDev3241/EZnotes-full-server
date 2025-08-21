const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openaiService");
const jwt = require("jsonwebtoken");
const encryptionUtils = require("../../encryption-utils");
const auditService = require("../services/auditService");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // Get user from database to ensure they still exist and are active
    const userResult = await pool.query(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Add user info to request
    req.user = {
      userId: userResult.rows[0].id,
      email: userResult.rows[0].email,
      role: userResult.rows[0].role,
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Multer middleware for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "temp/");
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["audio/wav", "audio/mp3", "audio/m4a", "audio/aac"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only WAV, MP3, M4A, AAC are allowed."));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Send chat message
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message, noteContext, conversationHistory } = req.body;
    const userId = req.user.userId;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Find or create conversation
    let conversationId = null;

    if (noteContext && noteContext.conversationId) {
      // Use existing conversation
      conversationId = noteContext.conversationId;
    } else if (noteContext && noteContext.noteId) {
      // Find conversation by note ID
      const convResult = await pool.query(
        `SELECT id FROM chat_conversations WHERE note_id = $1 AND user_id = $2`,
        [noteContext.noteId, userId]
      );

      if (convResult.rows.length > 0) {
        conversationId = convResult.rows[0].id;
      } else {
        // Create new conversation for this note
        const newConvResult = await pool.query(
          `INSERT INTO chat_conversations (user_id, note_id, title)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [
            userId,
            noteContext.noteId,
            `Chat for ${noteContext.fileName || "Note"}`,
          ]
        );
        conversationId = newConvResult.rows[0].id;
      }
    } else {
      // Create new general conversation
      const newConvResult = await pool.query(
        `INSERT INTO chat_conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [userId, `General Chat - ${new Date().toLocaleDateString()}`]
      );
      conversationId = newConvResult.rows[0].id;
    }

    // Save user message to database
    const userMessageResult = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message_text)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [conversationId, "user", message]
    );

    const userMessageId = userMessageResult.rows[0].id;

    // Get conversation history for context
    const historyResult = await pool.query(
      `SELECT sender_type, message_text, ai_response 
       FROM chat_messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conversationId]
    );

    // Format conversation history for OpenAI API
    const formattedHistory = historyResult.rows.map((msg) => ({
      role: msg.sender_type === "user" ? "user" : "assistant",
      content:
        msg.sender_type === "user"
          ? msg.message_text
          : msg.ai_response || msg.message_text,
    }));

    // Enhanced note context: Fetch actual note content if noteId is provided
    let enhancedNoteContext = noteContext;
    if (noteContext && noteContext.noteId) {
      try {
        console.log(`🔍 Fetching note content for noteId: ${noteContext.noteId}`);
        
        // Fetch the actual note content from the database
        const noteResult = await pool.query(
          `SELECT n.content, n.note_type, f.file_name, f.transcription
           FROM notes n
           LEFT JOIN files f ON n.file_id = f.id
           WHERE n.id = $1 AND n.user_id = $2`,
          [noteContext.noteId, userId]
        );

        if (noteResult.rows.length > 0) {
          const noteData = noteResult.rows[0];
          console.log(`✅ Found note content: ${noteData.content.length} characters`);
          
          // Parse the note content
          let parsedNotes = {};
          try {
            parsedNotes = JSON.parse(noteData.content);
          } catch (parseError) {
            console.warn(`⚠️ Failed to parse note content as JSON: ${parseError.message}`);
            // Fallback: treat as string
            parsedNotes = { soapNote: noteData.content, patientSummary: noteData.content };
          }

          // Enhance the note context with actual content
          enhancedNoteContext = {
            ...noteContext,
            notes: parsedNotes,
            transcription: noteData.transcription,
            fileName: noteData.file_name,
            noteType: noteData.note_type,
            status: "completed"
          };

          console.log(`🔍 Enhanced note context with actual content`);
          console.log(`🔍 SOAP Note length: ${parsedNotes.soapNote?.length || 0} characters`);
          console.log(`🔍 Patient Summary length: ${parsedNotes.patientSummary?.length || 0} characters`);
        } else {
          console.warn(`⚠️ No note found for noteId: ${noteContext.noteId}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching note content: ${error.message}`);
        // Continue with original noteContext
      }
    }

    // Generate AI response with enhanced note context
    const aiResponse = await openaiService.generateChatResponse(
      message,
      enhancedNoteContext,
      formattedHistory
    );

    // Save AI response to database
    await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message_text, ai_response)
       VALUES ($1, $2, $3, $4)`,
      [conversationId, "ai", "", aiResponse]
    );

    // Update conversation title if it's generic
    const convTitleResult = await pool.query(
      `SELECT title FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );

    if (convTitleResult.rows[0].title.startsWith("General Chat")) {
      await pool.query(
        `UPDATE chat_conversations SET title = $1 WHERE id = $2`,
        [`Chat: ${message.substring(0, 50)}...`, conversationId]
      );
    }

    res.json({
      success: true,
      message: "Chat message processed successfully",
      response: aiResponse,
      conversationId: conversationId,
      userMessageId: userMessageId,
    });
  } catch (error) {
    console.error("❌ Chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process chat message",
      error: error.message,
    });
  }
});

// Get chat history for a user
router.get("/history/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can only access their own chat history (unless admin)
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get chat conversations for the user
    const conversations = await pool.query(
      `SELECT
        c.id, c.title, c.created_at, c.note_id,
        f.original_name as filename
      FROM chat_conversations c
      LEFT JOIN notes n ON c.note_id = n.id
      LEFT JOIN files f ON n.file_id = f.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
      [userId]
    );

    // Get messages for each conversation
    const conversationsWithMessages = await Promise.all(
      conversations.rows.map(async (conv) => {
        const messages = await pool.query(
          "SELECT sender_type, message_text, ai_response, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
          [conv.id]
        );

        return {
          ...conv,
          messages: messages.rows,
        };
      })
    );

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "chat_conversations",
      null,
      "api"
    );

    res.json({
      success: true,
      conversations: conversationsWithMessages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat history",
      error: error.message,
    });
  }
});

// Get chat history for a specific note
router.get("/note/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const conversation = await pool.query(
      "SELECT * FROM chat_conversations WHERE note_id = $1 AND user_id = $2",
      [noteId, req.user.userId]
    );

    if (conversation.rows.length === 0) {
      return res.json({
        success: true,
        conversation: null,
        messages: [],
      });
    }

    const messages = await pool.query(
      "SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [conversation.rows[0].id]
    );

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "chat_conversations",
      noteId,
      "api"
    );

    res.json({
      success: true,
      conversation: conversation.rows[0],
      messages: messages.rows,
    });
  } catch (error) {
    console.error("Note chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get note chat history",
      error: error.message,
    });
  }
});

// Get conversation messages by conversation ID (new endpoint)
router.get(
  "/conversation/:conversationId",
  authenticateToken,
  async (req, res) => {
    try {
      const { conversationId } = req.params;

      // First verify the conversation exists and user has access
      const conversation = await pool.query(
        "SELECT * FROM chat_conversations WHERE id = $1 AND user_id = $2",
        [conversationId, req.user.userId]
      );

      if (conversation.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found or access denied",
        });
      }

      // Get all messages for this conversation
      const messages = await pool.query(
        `SELECT 
          id, conversation_id, sender_type, message_text, ai_response, 
          created_at
        FROM chat_messages 
        WHERE conversation_id = $1 
        ORDER BY created_at ASC`,
        [conversationId]
      );

      // Log data access
      await auditService.logDataAccess(
        req.user.userId,
        "chat_conversations",
        conversationId,
        "api"
      );

      res.json({
        success: true,
        conversation: conversation.rows[0],
        messages: messages.rows,
      });
    } catch (error) {
      console.error("Conversation messages error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get conversation messages",
        error: error.message,
      });
    }
  }
);

// Save chat checkpoint (new endpoint)
router.post("/checkpoint", authenticateToken, async (req, res) => {
  try {
    const { name, messages, conversationId, userId } = req.body;

    if (!name || !messages || !conversationId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Name, messages, conversation ID, and user ID are required",
      });
    }

    // Verify user can save checkpoints for this user
    if (req.user.role !== "admin" && req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Encrypt the messages
    const messagesString = JSON.stringify(messages);
    const encrypted = encryptionUtils.encryptData(messagesString, userId);
    const messagesHash = encryptionUtils.hashData(messagesString);

    // Save to chat_history_checkpoints table
    const checkpoint = await pool.query(
      `INSERT INTO chat_history_checkpoints 
       (user_id, conversation_id, checkpoint_name, encrypted_messages, encryption_iv, messages_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        userId,
        conversationId,
        name,
        encrypted.encryptedData,
        encrypted.iv,
        messagesHash,
      ]
    );

    // Log encryption operation
    await auditService.logEncryption(
      req.user.userId,
      "encrypt",
      "chat_history_checkpoints",
      checkpoint.rows[0].id,
      true
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "chat_history_checkpoints",
      checkpoint.rows[0].id,
      "create",
      null,
      `Checkpoint: ${name}`
    );

    res.json({
      success: true,
      checkpointId: checkpoint.rows[0].id,
      message: "Chat checkpoint saved successfully",
      timestamp: checkpoint.rows[0].created_at,
    });
  } catch (error) {
    console.error("Save chat checkpoint error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save chat checkpoint",
      error: error.message,
    });
  }
});

// Get chat checkpoints for a user
router.get("/checkpoints/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can access their checkpoints
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const checkpoints = await pool.query(
      `SELECT 
        chc.id, chc.checkpoint_name, chc.messages_hash, chc.created_at,
        c.title as conversation_title
      FROM chat_history_checkpoints chc
      LEFT JOIN chat_conversations c ON chc.conversation_id = c.id
      WHERE chc.user_id = $1
      ORDER BY chc.created_at DESC`,
      [userId]
    );

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "chat_history_checkpoints",
      null,
      "api"
    );

    res.json({
      success: true,
      checkpoints: checkpoints.rows,
      count: checkpoints.rows.length,
    });
  } catch (error) {
    console.error("Get chat checkpoints error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat checkpoints",
      error: error.message,
    });
  }
});

// Load chat checkpoint content
router.get("/checkpoint/:checkpointId", authenticateToken, async (req, res) => {
  try {
    const { checkpointId } = req.params;

    const checkpoint = await pool.query(
      `SELECT * FROM chat_history_checkpoints WHERE id = $1`,
      [checkpointId]
    );

    if (checkpoint.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Chat checkpoint not found",
      });
    }

    // Verify user can access this checkpoint
    if (
      req.user.role !== "admin" &&
      req.user.userId !== checkpoint.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Decrypt the messages
    const decryptedMessages = encryptionUtils.decryptData(
      checkpoint.rows[0].encrypted_messages,
      checkpoint.rows[0].encryption_iv,
      checkpoint.rows[0].user_id
    );

    const messages = JSON.parse(decryptedMessages);

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "chat_history_checkpoints",
      checkpointId,
      "api"
    );

    res.json({
      success: true,
      checkpoint: {
        id: checkpoint.rows[0].id,
        name: checkpoint.rows[0].checkpoint_name,
        messages: messages,
        createdAt: checkpoint.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error("Load chat checkpoint error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load chat checkpoint",
      error: error.message,
    });
  }
});

// Delete chat checkpoint
router.delete(
  "/checkpoint/:checkpointId",
  authenticateToken,
  async (req, res) => {
    try {
      const { checkpointId } = req.params;

      // Get current checkpoint to check permissions
      const currentCheckpoint = await pool.query(
        "SELECT * FROM chat_history_checkpoints WHERE id = $1",
        [checkpointId]
      );

      if (currentCheckpoint.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Chat checkpoint not found",
        });
      }

      // Verify user can delete this checkpoint
      if (
        req.user.role !== "admin" &&
        req.user.userId !== currentCheckpoint.rows[0].user_id
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const deletedCheckpoint = await pool.query(
        "DELETE FROM chat_history_checkpoints WHERE id = $1 RETURNING *",
        [checkpointId]
      );

      // Log data modification
      await auditService.logDataModify(
        req.user.userId,
        "chat_history_checkpoints",
        checkpointId,
        "delete",
        `Checkpoint: ${currentCheckpoint.rows[0].checkpoint_name}`,
        null
      );

      res.json({
        success: true,
        message: "Chat checkpoint deleted successfully",
      });
    } catch (error) {
      console.error("Delete chat checkpoint error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete chat checkpoint",
        error: error.message,
      });
    }
  }
);

// Edit chat message (new endpoint)
router.put("/message/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newText } = req.body;

    if (!newText) {
      return res.status(400).json({
        success: false,
        message: "New text is required",
      });
    }

    // Get current message to check permissions and for audit
    const currentMessage = await pool.query(
      `SELECT cm.*, c.user_id 
       FROM chat_messages cm
       JOIN chat_conversations c ON cm.conversation_id = c.id
       WHERE cm.id = $1`,
      [messageId]
    );

    if (currentMessage.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Verify user can modify this message
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentMessage.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Only allow editing user messages (not AI responses)
    if (currentMessage.rows[0].sender_type !== "user") {
      return res.status(400).json({
        success: false,
        message: "Only user messages can be edited",
      });
    }

    const oldText = currentMessage.rows[0].message_text;

    // Update the message
    const updatedMessage = await pool.query(
      `UPDATE chat_messages
       SET message_text = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newText, messageId]
    );

    // Save edit to audit trail
    const encryptedOld = encryptionUtils.encryptData(oldText, req.user.userId);
    const encryptedNew = encryptionUtils.encryptData(newText, req.user.userId);

    await pool.query(
      `INSERT INTO message_edits 
       (message_id, user_id, encrypted_old_content, encrypted_new_content, encryption_iv, edit_reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        messageId,
        req.user.userId,
        encryptedOld.encryptedData,
        encryptedNew.encryptedData,
        encryptedOld.iv,
        "User edit",
      ]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "chat_messages",
      messageId,
      "edit",
      oldText.substring(0, 100) + "...",
      newText.substring(0, 100) + "..."
    );

    res.json({
      success: true,
      message: "Message updated successfully",
      updatedMessage: updatedMessage.rows[0],
    });
  } catch (error) {
    console.error("Edit message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to edit message",
      error: error.message,
    });
  }
});

// Delete chat message (new endpoint)
router.delete("/message/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    // Get current message to check permissions
    const currentMessage = await pool.query(
      `SELECT cm.*, c.user_id 
       FROM chat_messages cm
       JOIN chat_conversations c ON cm.conversation_id = c.id
       WHERE cm.id = $1`,
      [messageId]
    );

    if (currentMessage.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Verify user can delete this message
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentMessage.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Only allow deleting user messages (not AI responses)
    if (currentMessage.rows[0].sender_type !== "user") {
      return res.status(400).json({
        success: false,
        message: "Only user messages can be deleted",
      });
    }

    const deletedMessage = await pool.query(
      "DELETE FROM chat_messages WHERE id = $1 RETURNING *",
      [messageId]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "chat_messages",
      messageId,
      "delete",
      currentMessage.rows[0].message_text.substring(0, 100) + "...",
      null
    );

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error.message,
    });
  }
});

// Audio transcription endpoint (new endpoint)
router.post(
  "/transcribe",
  authenticateToken,
  upload.single("audio"),
  async (req, res) => {
    try {
      // Check if audio file is provided
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Audio file is required",
        });
      }

      const audioFile = req.file;
      const userId = req.user.userId;

      // Validate file type
      const allowedTypes = ["audio/wav", "audio/mp3", "audio/m4a", "audio/aac"];
      if (!allowedTypes.includes(audioFile.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Invalid audio file type. Supported: WAV, MP3, M4A, AAC",
        });
      }

      try {
        // Transcribe audio using OpenAI
        const transcription = await openaiService.transcribeAudio(
          audioFile.path
        );

        // Clean up temp file
        fs.unlinkSync(audioFile.path);

        // Log data access
        await auditService.logDataAccess(
          userId,
          "audio_transcription",
          null,
          "api"
        );

        res.json({
          success: true,
          transcription: transcription,
          message: "Audio transcribed successfully",
        });
      } catch (transcriptionError) {
        // Clean up temp file on error
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        throw transcriptionError;
      }
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to transcribe audio",
        error: error.message,
      });
    }
  }
);

// Get conversation by ID (new endpoint)
router.get(
  "/conversation/:conversationId",
  authenticateToken,
  async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.userId;

      // Get conversation details
      const conversationResult = await pool.query(
        `SELECT * FROM chat_conversations WHERE id = $1`,
        [conversationId]
      );

      if (conversationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found",
        });
      }

      // Verify user can access this conversation
      if (
        req.user.role !== "admin" &&
        conversationResult.rows[0].user_id !== userId
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Get messages for this conversation
      const messagesResult = await pool.query(
        `SELECT * FROM chat_messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
        [conversationId]
      );

      // Log data access
      await auditService.logDataAccess(
        userId,
        "chat_conversation",
        conversationId,
        "api"
      );

      res.json({
        success: true,
        conversation: conversationResult.rows[0],
        messages: messagesResult.rows,
        count: messagesResult.rows.length,
      });
    } catch (error) {
      console.error("Get conversation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get conversation",
        error: error.message,
      });
    }
  }
);

module.exports = router;
