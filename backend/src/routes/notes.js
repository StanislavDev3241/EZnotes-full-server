const express = require("express");
const { pool } = require("../config/database");
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

// Get all notes for a user
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const notes = await pool.query(
      `SELECT 
        n.id, n.file_id, n.note_type, n.content, n.version, 
        n.parent_note_id, n.prompt_used, n.ai_model, n.quality_score,
        n.status, n.retention_date, n.created_at, n.updated_at,
        f.original_name as filename
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC`,
      [userId]
    );

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
        n.*, f.original_name as filename, f.transcription
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
    const { content, status, quality_score } = req.body;

    const updatedNote = await pool.query(
      `UPDATE notes 
       SET content = COALESCE($1, content), 
           status = COALESCE($2, status), 
           quality_score = COALESCE($3, quality_score),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [content, status, quality_score, noteId]
    );

    if (updatedNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

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

    const deletedNote = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [noteId]
    );

    if (deletedNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

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

module.exports = router;
