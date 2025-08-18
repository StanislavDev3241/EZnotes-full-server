const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openaiService");
const jwt = require("jsonwebtoken");
const encryptionUtils = require("../../encryption-utils");
const auditService = require("../services/auditService");

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

// Chat with AI
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message, noteContext, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Prepare context for AI
    let context = {};
    if (noteContext) {
      context = {
        transcription: noteContext.transcription,
        soapNote: noteContext.notes?.soapNote,
        patientSummary: noteContext.notes?.patientSummary,
        customPrompt: noteContext.customPrompt,
        fileName: noteContext.fileName,
      };
    }

    // Format conversation history for AI
    const formattedHistory = (conversationHistory || []).map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text,
    }));

    // Get AI response with context
    const response = await openaiService.chatWithAI(
      formattedHistory,
      message,
      context
    );

    // Always save chat message to database
    try {
      let conversationId;

      if (noteContext?.fileId) {
        // File-specific conversation
        const existingConversation = await pool.query(
          "SELECT id FROM chat_conversations WHERE note_id = $1 AND user_id = $2",
          [noteContext.fileId, req.user.userId]
        );

        if (existingConversation.rows.length > 0) {
          conversationId = existingConversation.rows[0].id;
        } else {
          const newConversation = await pool.query(
            "INSERT INTO chat_conversations (user_id, note_id, title) VALUES ($1, $2, $3) RETURNING id",
            [
              req.user.userId,
              noteContext.fileId,
              `Chat about ${noteContext.fileName}`,
            ]
          );
          conversationId = newConversation.rows[0].id;
        }
      } else {
        // General chat conversation (not file-specific)
        const existingConversation = await pool.query(
          "SELECT id FROM chat_conversations WHERE user_id = $1 AND note_id IS NULL AND title = 'General Chat'",
          [req.user.userId]
        );

        if (existingConversation.rows.length > 0) {
          conversationId = existingConversation.rows[0].id;
        } else {
          const newConversation = await pool.query(
            "INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING id",
            [req.user.userId, "General Chat"]
          );
          conversationId = newConversation.rows[0].id;
        }
      }

      // Save user message
      await pool.query(
        "INSERT INTO chat_messages (conversation_id, sender_type, message_text) VALUES ($1, $2, $3)",
        [conversationId, "user", message]
      );

      // Save AI response
      await pool.query(
        "INSERT INTO chat_messages (conversation_id, sender_type, message_text, ai_response) VALUES ($1, $2, $3, $4)",
        [conversationId, "ai", "", response]
      );

      // Log chat activity
      await auditService.logDataModify(
        req.user.userId,
        "chat_messages",
        conversationId,
        "create",
        null,
        message.substring(0, 100) + "..."
      );

      console.log(`💬 Chat saved to database: conversation ${conversationId}`);
    } catch (dbError) {
      console.error("Failed to save chat to database:", dbError);
      // Don't fail the request if database save fails
    }

    res.json({
      success: true,
      response: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get AI response",
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

module.exports = router;
