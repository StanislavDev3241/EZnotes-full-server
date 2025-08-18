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
