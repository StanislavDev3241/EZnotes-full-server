const express = require("express");
const { pool } = require("../config/database");
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

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

// Edit a chat message
router.put("/:messageId", authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newText, reason } = req.body;

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
    if (req.user.role !== "admin" && req.user.userId !== currentMessage.rows[0].user_id) {
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

    // Save edit to audit trail with encryption
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
        reason || "User edit",
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

// Delete a chat message
router.delete("/:messageId", authenticateToken, async (req, res) => {
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
    if (req.user.role !== "admin" && req.user.userId !== currentMessage.rows[0].user_id) {
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

// Get message edit history
router.get("/:messageId/edits", authenticateToken, async (req, res) => {
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

    // Verify user can access this message
    if (req.user.role !== "admin" && req.user.userId !== currentMessage.rows[0].user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get edit history
    const edits = await pool.query(
      `SELECT id, edit_reason, edited_at
       FROM message_edits
       WHERE message_id = $1
       ORDER BY edited_at DESC`,
      [messageId]
    );

    // Log data access
    await auditService.logDataAccess(req.user.userId, "message_edits", messageId, "api");

    res.json({
      success: true,
      edits: edits.rows,
      count: edits.rows.length,
    });
  } catch (error) {
    console.error("Get message edits error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get message edits",
      error: error.message,
    });
  }
});

// Get decrypted content of a specific edit
router.get("/edit/:editId/content", authenticateToken, async (req, res) => {
  try {
    const { editId } = req.params;

    const edit = await pool.query(
      `SELECT me.*, cm.sender_type, c.user_id
       FROM message_edits me
       JOIN chat_messages cm ON me.message_id = cm.id
       JOIN chat_conversations c ON cm.conversation_id = c.id
       WHERE me.id = $1`,
      [editId]
    );

    if (edit.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Edit not found",
      });
    }

    // Verify user can access this edit
    if (req.user.role !== "admin" && req.user.userId !== edit.rows[0].user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Decrypt the content
    const oldContent = encryptionUtils.decryptData(
      edit.rows[0].encrypted_old_content,
      edit.rows[0].encryption_iv,
      edit.rows[0].user_id
    );

    const newContent = encryptionUtils.decryptData(
      edit.rows[0].encrypted_new_content,
      edit.rows[0].encryption_iv,
      edit.rows[0].user_id
    );

    // Log data access
    await auditService.logDataAccess(req.user.userId, "message_edits", editId, "api");

    res.json({
      success: true,
      edit: {
        id: edit.rows[0].id,
        oldContent: oldContent,
        newContent: newContent,
        reason: edit.rows[0].edit_reason,
        editedAt: edit.rows[0].edited_at,
      },
    });
  } catch (error) {
    console.error("Get edit content error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get edit content",
      error: error.message,
    });
  }
});

module.exports = router; 