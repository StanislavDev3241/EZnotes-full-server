const WebSocket = require("ws");
const openaiService = require("./openaiService");
const { pool } = require("../config/database");

class ChatService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.setupWebSocket();
    console.log("🚀 WebSocket chat service initialized");
  }

  setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      console.log("🔌 New WebSocket connection established");

      // Store user context
      ws.userId = null;
      ws.noteId = null;

      ws.on("message", async (message) => {
        try {
          let data;
          try {
            data = JSON.parse(message);
          } catch (parseError) {
            console.error("❌ Invalid JSON in WebSocket message:", parseError);
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Invalid message format",
              })
            );
            return;
          }
          
          console.log(`📨 Received message type: ${data.type}`);

          switch (data.type) {
            case "authenticate":
              await this.handleAuthentication(ws, data);
              break;
            case "chat_message":
              await this.handleChatMessage(ws, data);
              break;
            case "note_improvement":
              await this.handleNoteImprovement(ws, data);
              break;
            case "start_conversation":
              await this.handleStartConversation(ws, data);
              break;
            default:
              ws.send(
                JSON.stringify({
                  type: "error",
                  error: "Unknown message type",
                })
              );
          }
        } catch (error) {
          console.error("❌ WebSocket error:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              error: "Internal server error",
            })
          );
        }
      });

      ws.on("close", () => {
        console.log("🔌 WebSocket connection closed");
      });

      ws.on("error", (error) => {
        console.error("❌ WebSocket error:", error);
      });
    });
  }

  async handleAuthentication(ws, data) {
    try {
      // Verify user token and set context
      const token = data.token;
      if (!token) {
        ws.send(
          JSON.stringify({
            type: "auth_error",
            error: "Token required",
          })
        );
        return;
      }

      // Verify token and get user info
      const userResult = await pool.query(
        "SELECT id, email, role FROM users WHERE id = $1",
        [data.userId]
      );

      if (userResult.rows.length === 0) {
        ws.send(
          JSON.stringify({
            type: "auth_error",
            error: "Invalid user",
          })
        );
        return;
      }

      ws.userId = data.userId;
      ws.noteId = data.noteId;

      ws.send(
        JSON.stringify({
          type: "authenticated",
          userId: data.userId,
          noteId: data.noteId,
        })
      );

      console.log(
        `✅ User ${data.userId} authenticated for note ${data.noteId}`
      );
    } catch (error) {
      console.error("❌ Authentication error:", error);
      ws.send(
        JSON.stringify({
          type: "auth_error",
          error: "Authentication failed",
        })
      );
    }
  }

  async handleStartConversation(ws, data) {
    try {
      if (!ws.userId || !ws.noteId) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Not authenticated",
          })
        );
        return;
      }

      // Create or get existing conversation
      let conversationId = data.conversationId;

      if (!conversationId) {
        const convResult = await pool.query(
          `INSERT INTO chat_conversations (user_id, note_id, title) 
           VALUES ($1, $2, $3) RETURNING id`,
          [ws.userId, ws.noteId, `Chat for Note ${ws.noteId}`]
        );
        conversationId = convResult.rows[0].id;
      }

      // Get conversation history
      const historyResult = await pool.query(
        `SELECT * FROM chat_messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC`,
        [conversationId]
      );

      ws.send(
        JSON.stringify({
          type: "conversation_started",
          conversationId: conversationId,
          history: historyResult.rows,
        })
      );

      console.log(
        `💬 Conversation ${conversationId} started for note ${ws.noteId}`
      );
    } catch (error) {
      console.error("❌ Start conversation error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to start conversation",
        })
      );
    }
  }

  async handleChatMessage(ws, data) {
    try {
      if (!ws.userId || !ws.noteId) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Not authenticated",
          })
        );
        return;
      }

      const { conversationId, message } = data;

      // Save user message
      const messageResult = await pool.query(
        `INSERT INTO chat_messages (conversation_id, sender_type, message_text) 
         VALUES ($1, 'user', $2) RETURNING id`,
        [conversationId, message]
      );

      const messageId = messageResult.rows[0].id;

      // Get conversation history
      const historyResult = await pool.query(
        `SELECT * FROM chat_messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC`,
        [conversationId]
      );

      // Get note context
      const noteResult = await pool.query(
        `SELECT content FROM notes WHERE id = $1`,
        [ws.noteId]
      );

      const noteContext = noteResult.rows[0]?.content || {};

      // Get AI response
      const aiResponse = await openaiService.chatWithAI(
        historyResult.rows,
        message,
        noteContext
      );

      // Save AI response
      await pool.query(
        `INSERT INTO chat_messages (conversation_id, sender_type, message_text) 
         VALUES ($1, 'ai', $2)`,
        [conversationId, aiResponse]
      );

      // Send response back to client
      ws.send(
        JSON.stringify({
          type: "ai_response",
          messageId: messageId,
          message: message,
          aiResponse: aiResponse,
          conversationId: conversationId,
        })
      );

      console.log(
        `💬 Chat message processed for conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Chat message error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to process message",
        })
      );
    }
  }

  async handleNoteImprovement(ws, data) {
    try {
      if (!ws.userId || !ws.noteId) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: "Not authenticated",
          })
        );
        return;
      }

      const {
        conversationId,
        improvementType,
        oldContent,
        newContent,
        reason,
      } = data;

      // Save improvement record
      await pool.query(
        `INSERT INTO note_improvements 
         (note_id, conversation_id, improvement_type, old_content, new_content, improvement_reason) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ws.noteId,
          conversationId,
          improvementType,
          oldContent,
          newContent,
          reason,
        ]
      );

      // Create new note version
      const noteResult = await pool.query(
        `INSERT INTO notes (file_id, user_id, note_type, content, version, parent_note_id) 
         VALUES ((SELECT file_id FROM notes WHERE id = $1), $2, 'ai_generated', $3, 
                (SELECT COALESCE(MAX(version), 0) + 1 FROM notes WHERE file_id = 
                 (SELECT file_id FROM notes WHERE id = $1)), $1) 
         RETURNING id, version`,
        [ws.noteId, ws.userId, newContent]
      );

      const newNoteId = noteResult.rows[0].id;
      const newVersion = noteResult.rows[0].version;

      // Send confirmation
      ws.send(
        JSON.stringify({
          type: "improvement_saved",
          noteId: ws.noteId,
          newNoteId: newNoteId,
          version: newVersion,
          improvementType: improvementType,
        })
      );

      console.log(`✅ Note improvement saved: version ${newVersion} created`);
    } catch (error) {
      console.error("❌ Note improvement error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to save improvement",
        })
      );
    }
  }

  // Broadcast message to all connected clients for a specific note
  broadcastToNote(noteId, message) {
    this.wss.clients.forEach((client) => {
      if (client.noteId === noteId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

module.exports = ChatService;
