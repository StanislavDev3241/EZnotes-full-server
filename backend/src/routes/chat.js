const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openaiService");
const jwt = require("jsonwebtoken");

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

    // Get chat conversations for the user
    const conversations = await pool.query(
      `SELECT 
        c.id, c.title, c.created_at, c.note_id,
        f.original_name as filename
      FROM chat_conversations c
      LEFT JOIN notes n ON c.note_id = n.id
      LEFT JOIN files f ON n.file_id = f.id
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC`,
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

module.exports = router;
