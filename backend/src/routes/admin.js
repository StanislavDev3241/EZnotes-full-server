const express = require("express");
const { pool } = require("../config/database");
const jwt = require("jsonwebtoken");
const auditService = require("../services/auditService");
const encryptionUtils = require("../../encryption-utils");

const router = express.Router();

// Middleware to verify admin JWT token
const authenticateAdmin = async (req, res, next) => {
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

    // Get user from database to ensure they exist and are admin
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

    if (userResult.rows[0].role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
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
    console.error("Admin authentication error:", error);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Get all users (admin only)
router.get("/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT 
        id, email, first_name, last_name, role, is_active, 
        created_at, updated_at
      FROM users
      ORDER BY created_at DESC`
    );

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "users",
      null,
      "admin_api"
    );

    res.json({
      success: true,
      users: users.rows,
      count: users.rows.length,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
      error: error.message,
    });
  }
});

// Get user details (admin only)
router.get("/users/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await pool.query(
      `SELECT 
        id, email, first_name, last_name, role, is_active, 
        created_at, updated_at
      FROM users
      WHERE id = $1`,
      [userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "users",
      userId,
      "admin_api"
    );

    res.json({
      success: true,
      user: user.rows[0],
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message,
    });
  }
});

// Update user (admin only)
router.put("/users/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { first_name, last_name, role, is_active } = req.body;

    // Get current user for audit
    const currentUser = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (currentUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updatedUser = await pool.query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [first_name, last_name, role, is_active, userId]
    );

    // Log admin action
    await auditService.logDataModify(
      req.user.userId,
      "users",
      userId,
      "admin_update",
      JSON.stringify(currentUser.rows[0]),
      JSON.stringify(updatedUser.rows[0])
    );

    res.json({
      success: true,
      user: updatedUser.rows[0],
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
});

// Get all audit logs (admin only)
router.get("/audit-logs", authenticateAdmin, async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      actionType,
      userId,
      dateFrom,
      dateTo,
    } = req.query;

    const filters = {};
    if (actionType) filters.actionType = actionType;
    if (userId) filters.userId = parseInt(userId);
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const logs = await auditService.getAllAuditLogs(
      parseInt(limit),
      parseInt(offset),
      filters
    );

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "audit_logs",
      null,
      "admin_api"
    );

    res.json({
      success: true,
      logs: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get audit logs",
      error: error.message,
    });
  }
});

// Get audit logs for a specific user (admin only)
router.get("/audit-logs/user/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const logs = await auditService.getUserAuditLogs(
      parseInt(userId),
      parseInt(limit),
      parseInt(offset)
    );

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "audit_logs",
      userId,
      "admin_api"
    );

    res.json({
      success: true,
      logs: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("Get user audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user audit logs",
      error: error.message,
    });
  }
});

// Clean old audit logs (admin only)
router.post("/audit-logs/clean", authenticateAdmin, async (req, res) => {
  try {
    const { daysToKeep = 2555 } = req.body; // Default 7 years for HIPAA

    const cleanedCount = await auditService.cleanOldLogs(parseInt(daysToKeep));

    // Log admin action
    await auditService.logDataModify(
      req.user.userId,
      "audit_logs",
      null,
      "clean_old_logs",
      null,
      `Cleaned ${cleanedCount} old logs`
    );

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} old audit logs`,
      cleanedCount: cleanedCount,
    });
  } catch (error) {
    console.error("Clean audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clean audit logs",
      error: error.message,
    });
  }
});

// Get system statistics (admin only)
router.get("/stats", authenticateAdmin, async (req, res) => {
  try {
    // Get user statistics
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
      FROM users
    `);

    // Get file statistics
    const fileStats = await pool.query(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_files,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
        SUM(file_size) as total_size
      FROM files
    `);

    // Get note statistics
    const noteStats = await pool.query(`
      SELECT 
        COUNT(*) as total_notes,
        COUNT(CASE WHEN status = 'generated' THEN 1 END) as generated_notes,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_notes
      FROM notes
    `);

    // Get chat statistics
    const chatStats = await pool.query(`
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(DISTINCT user_id) as users_with_chats
      FROM chat_conversations
    `);

    // Get encrypted data statistics
    const encryptedStats = await pool.query(`
      SELECT 
        COUNT(*) as total_encrypted_notes,
        COUNT(*) as total_chat_checkpoints,
        COUNT(*) as total_message_edits
      FROM (
        SELECT 'notes' as type FROM encrypted_saved_notes
        UNION ALL
        SELECT 'checkpoints' as type FROM chat_history_checkpoints
        UNION ALL
        SELECT 'edits' as type FROM message_edits
      ) t
    `);

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "system_stats",
      null,
      "admin_api"
    );

    res.json({
      success: true,
      stats: {
        users: userStats.rows[0],
        files: fileStats.rows[0],
        notes: noteStats.rows[0],
        chat: chatStats.rows[0],
        encrypted: encryptedStats.rows[0],
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get system stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get system statistics",
      error: error.message,
    });
  }
});

// Get encryption status (admin only)
router.get("/encryption-status", authenticateAdmin, async (req, res) => {
  try {
    // Check if encryption is working
    const testData = "test_encryption_data";
    const testUserId = 1;

    try {
      const encrypted = encryptionUtils.encryptData(testData, testUserId);
      const decrypted = encryptionUtils.decryptData(
        encrypted.encryptedData,
        encrypted.iv,
        testUserId
      );

      const encryptionWorking = decrypted === testData;

      res.json({
        success: true,
        encryption: {
          status: encryptionWorking ? "working" : "failed",
          algorithm: "aes-256-cbc",
          keyDerivation: "sha256 from user_id + master_key",
          testResult: encryptionWorking ? "passed" : "failed",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (encryptionError) {
      res.json({
        success: true,
        encryption: {
          status: "error",
          algorithm: "aes-256-cbc",
          keyDerivation: "sha256 from user_id + master_key",
          testResult: "failed",
          error: encryptionError.message,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Log admin action
    await auditService.logDataAccess(
      req.user.userId,
      "encryption_status",
      null,
      "admin_api"
    );
  } catch (error) {
    console.error("Get encryption status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get encryption status",
      error: error.message,
    });
  }
});

module.exports = router;
