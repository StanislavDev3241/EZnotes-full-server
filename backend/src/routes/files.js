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

// Get all files for a user
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const files = await pool.query(
      `SELECT 
        f.id, f.filename, f.original_name, f.file_path, f.file_size, 
        f.file_type, f.user_id, f.transcription, f.status, 
        f.created_at, f.updated_at,
        COUNT(n.id) as note_count
      FROM files f
      LEFT JOIN notes n ON f.id = n.file_id
      WHERE f.user_id = $1
      GROUP BY f.id
      ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      files: files.rows,
      count: files.rows.length,
    });
  } catch (error) {
    console.error("Get user files error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user files",
      error: error.message,
    });
  }
});

// Get a specific file by ID
router.get("/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await pool.query(
      `SELECT 
        f.*, 
        COUNT(n.id) as note_count,
        ARRAY_AGG(n.id) as note_ids
      FROM files f
      LEFT JOIN notes n ON f.id = n.file_id
      WHERE f.id = $1
      GROUP BY f.id`,
      [fileId]
    );

    if (file.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.json({
      success: true,
      file: file.rows[0],
    });
  } catch (error) {
    console.error("Get file error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get file",
      error: error.message,
    });
  }
});

// Update file status
router.put("/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status, transcription } = req.body;

    const updatedFile = await pool.query(
      `UPDATE files 
       SET status = COALESCE($1, status), 
           transcription = COALESCE($2, transcription),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, transcription, fileId]
    );

    if (updatedFile.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.json({
      success: true,
      file: updatedFile.rows[0],
      message: "File updated successfully",
    });
  } catch (error) {
    console.error("Update file error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update file",
      error: error.message,
    });
  }
});

// Delete a file
router.delete("/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    // First delete associated notes
    await pool.query("DELETE FROM notes WHERE file_id = $1", [fileId]);

    // Then delete the file
    const deletedFile = await pool.query(
      "DELETE FROM files WHERE id = $1 RETURNING *",
      [fileId]
    );

    if (deletedFile.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.json({
      success: true,
      message: "File and associated notes deleted successfully",
    });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete file",
      error: error.message,
    });
  }
});

// Get file statistics for a user
router.get("/stats/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_files,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
        COUNT(CASE WHEN transcription IS NOT NULL THEN 1 END) as transcribed_files,
        SUM(file_size) as total_size,
        COUNT(DISTINCT file_type) as unique_file_types
      FROM files 
      WHERE user_id = $1`,
      [userId]
    );

    const noteStats = await pool.query(
      `SELECT 
        COUNT(*) as total_notes,
        COUNT(CASE WHEN status = 'generated' THEN 1 END) as generated_notes,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_notes
      FROM notes n
      JOIN files f ON n.file_id = f.id
      WHERE f.user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      stats: {
        files: stats.rows[0],
        notes: noteStats.rows[0],
      },
    });
  } catch (error) {
    console.error("Get file stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get file statistics",
      error: error.message,
    });
  }
});

module.exports = router;
