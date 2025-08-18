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

// Get all notes for a user
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can only access their own notes (unless admin)
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const notes = await pool.query(
      `SELECT 
        n.id, n.file_id, n.user_id, n.note_type, n.content, n.status,
        n.version, n.parent_note_id, n.prompt_used, n.ai_model,
        n.created_at, n.updated_at,
        f.original_name as filename,
        f.transcription
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC`,
      [userId]
    );

    // Log data access
    await auditService.logDataAccess(req.user.userId, "notes", null, "api");

    res.json({
      success: true,
      notes: notes.rows,
      count: notes.rows.length,
    });
  } catch (error) {
    console.error("Get user notes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user notes",
      error: error.message,
    });
  }
});

// Get a specific note by ID
router.get("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await pool.query(
      `SELECT 
        n.*,
        f.original_name as filename,
        f.transcription
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.id = $1`,
      [noteId]
    );

    if (note.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can access this note
    if (req.user.role !== "admin" && req.user.userId !== note.rows[0].user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Log data access
    await auditService.logDataAccess(req.user.userId, "notes", noteId, "api");

    res.json({
      success: true,
      note: note.rows[0],
    });
  } catch (error) {
    console.error("Get note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get note",
      error: error.message,
    });
  }
});

// Update a note
router.put("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content, status, note_type } = req.body;

    // Get current note to check permissions and for audit
    const currentNote = await pool.query("SELECT * FROM notes WHERE id = $1", [
      noteId,
    ]);

    if (currentNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can modify this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updatedNote = await pool.query(
      `UPDATE notes
       SET content = COALESCE($1, content),
           status = COALESCE($2, status),
           note_type = COALESCE($3, note_type),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [content, status, note_type, noteId]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "notes",
      noteId,
      "update",
      currentNote.rows[0].content,
      content
    );

    res.json({
      success: true,
      note: updatedNote.rows[0],
      message: "Note updated successfully",
    });
  } catch (error) {
    console.error("Update note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update note",
      error: error.message,
    });
  }
});

// Delete a note
router.delete("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    // Get current note to check permissions
    const currentNote = await pool.query("SELECT * FROM notes WHERE id = $1", [
      noteId,
    ]);

    if (currentNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can delete this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const deletedNote = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [noteId]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "notes",
      noteId,
      "delete",
      currentNote.rows[0].content,
      null
    );

    res.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Delete note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete note",
      error: error.message,
    });
  }
});

// Save encrypted note (new endpoint)
router.post("/save", authenticateToken, async (req, res) => {
  try {
    const { content, noteType, userId, conversationId, fileId } = req.body;

    if (!content || !noteType) {
      return res.status(400).json({
        success: false,
        message: "Content and note type are required",
      });
    }

    // Verify user can save notes for this user
    if (req.user.role !== "admin" && req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Encrypt the note content
    const encrypted = encryptionUtils.encryptData(content, userId);
    const contentHash = encryptionUtils.hashData(content);

    // Save to encrypted_saved_notes table
    const savedNote = await pool.query(
      `INSERT INTO encrypted_saved_notes 
       (user_id, note_type, encrypted_content, encryption_iv, content_hash, file_id, conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        userId,
        noteType,
        encrypted.encryptedData,
        encrypted.iv,
        contentHash,
        fileId || null,
        conversationId || null,
      ]
    );

    // Log encryption operation
    await auditService.logEncryption(
      req.user.userId,
      "encrypt",
      "encrypted_saved_notes",
      savedNote.rows[0].id,
      true
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "encrypted_saved_notes",
      savedNote.rows[0].id,
      "create",
      null,
      content.substring(0, 100) + "..."
    );

    res.json({
      success: true,
      noteId: savedNote.rows[0].id,
      message: "Note saved successfully",
      timestamp: savedNote.rows[0].created_at,
    });
  } catch (error) {
    console.error("Save encrypted note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save note",
      error: error.message,
    });
  }
});

// Get encrypted saved notes for a user
router.get("/saved/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can access their saved notes
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const savedNotes = await pool.query(
      `SELECT 
        id, note_type, content_hash, file_id, conversation_id, created_at, updated_at
      FROM encrypted_saved_notes
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "encrypted_saved_notes",
      null,
      "api"
    );

    res.json({
      success: true,
      notes: savedNotes.rows,
      count: savedNotes.rows.length,
    });
  } catch (error) {
    console.error("Get saved notes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get saved notes",
      error: error.message,
    });
  }
});

// Get decrypted content of a saved note
router.get("/saved/content/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const savedNote = await pool.query(
      `SELECT * FROM encrypted_saved_notes WHERE id = $1`,
      [noteId]
    );

    if (savedNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Saved note not found",
      });
    }

    // Verify user can access this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== savedNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Decrypt the content
    const decryptedContent = encryptionUtils.decryptData(
      savedNote.rows[0].encrypted_content,
      savedNote.rows[0].encryption_iv,
      savedNote.rows[0].user_id
    );

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "encrypted_saved_notes",
      noteId,
      "api"
    );

    res.json({
      success: true,
      note: {
        id: savedNote.rows[0].id,
        noteType: savedNote.rows[0].note_type,
        content: decryptedContent,
        createdAt: savedNote.rows[0].created_at,
        updatedAt: savedNote.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("Get saved note content error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get note content",
      error: error.message,
    });
  }
});

module.exports = router;
