const express = require("express");
const { pool } = require("../config/database");

const router = express.Router();

// Middleware to verify JWT token (placeholder for now)
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7);

    // For now, we'll use a simple verification
    // In production, you should verify the JWT properly
    const decoded = { userId: "temp-user-id" }; // Placeholder

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid token",
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
