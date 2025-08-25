const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { pool } = require("../config/database");
const auditService = require("../services/auditService");

const router = express.Router();

// Get all custom prompts for a user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT id, name, system_prompt, user_prompt, note_type, created_at, updated_at 
       FROM custom_prompts 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    // Log data access
    await auditService.logDataAccess(
      userId,
      "custom_prompts",
      null,
      "api"
    );

    res.json({
      success: true,
      prompts: result.rows,
    });
  } catch (error) {
    console.error("Get custom prompts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get custom prompts",
      error: error.message,
    });
  }
});

// Get a specific custom prompt by ID
router.get("/:promptId", authenticateToken, async (req, res) => {
  try {
    const { promptId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT id, name, system_prompt, user_prompt, note_type, created_at, updated_at 
       FROM custom_prompts 
       WHERE id = $1 AND user_id = $2`,
      [promptId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Custom prompt not found",
      });
    }

    // Log data access
    await auditService.logDataAccess(
      userId,
      "custom_prompts",
      promptId,
      "api"
    );

    res.json({
      success: true,
      prompt: result.rows[0],
    });
  } catch (error) {
    console.error("Get custom prompt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get custom prompt",
      error: error.message,
    });
  }
});

// Create a new custom prompt
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, systemPrompt, userPrompt, noteType } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!name || !systemPrompt) {
      return res.status(400).json({
        success: false,
        message: "Name and system prompt are required",
      });
    }

    // Validate note type
    if (noteType && !["soap", "summary", "both"].includes(noteType)) {
      return res.status(400).json({
        success: false,
        message: "Note type must be 'soap', 'summary', or 'both'",
      });
    }

    // Validate prompt length
    if (systemPrompt.length > 10000) {
      return res.status(400).json({
        success: false,
        message: "System prompt must be less than 10,000 characters",
      });
    }

    const result = await pool.query(
      `INSERT INTO custom_prompts (user_id, name, system_prompt, user_prompt, note_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, system_prompt, user_prompt, note_type, created_at, updated_at`,
      [userId, name, systemPrompt, userPrompt || null, noteType || "both"]
    );

    const newPrompt = result.rows[0];

    // Log data modification
    await auditService.logDataModify(
      userId,
      "custom_prompts",
      newPrompt.id,
      "create",
      null,
      `Created custom prompt: ${name}`
    );

    res.json({
      success: true,
      prompt: newPrompt,
      message: "Custom prompt created successfully",
    });
  } catch (error) {
    console.error("Create custom prompt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create custom prompt",
      error: error.message,
    });
  }
});

// Update a custom prompt
router.put("/:promptId", authenticateToken, async (req, res) => {
  try {
    const { promptId } = req.params;
    const { name, systemPrompt, userPrompt, noteType } = req.body;
    const userId = req.user.userId;

    // Check if prompt exists and belongs to user
    const existingPrompt = await pool.query(
      `SELECT id, name FROM custom_prompts WHERE id = $1 AND user_id = $2`,
      [promptId, userId]
    );

    if (existingPrompt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Custom prompt not found",
      });
    }

    // Validate required fields
    if (!name || !systemPrompt) {
      return res.status(400).json({
        success: false,
        message: "Name and system prompt are required",
      });
    }

    // Validate note type
    if (noteType && !["soap", "summary", "both"].includes(noteType)) {
      return res.status(400).json({
        success: false,
        message: "Note type must be 'soap', 'summary', or 'both'",
      });
    }

    // Validate prompt length
    if (systemPrompt.length > 10000) {
      return res.status(400).json({
        success: false,
        message: "System prompt must be less than 10,000 characters",
      });
    }

    const result = await pool.query(
      `UPDATE custom_prompts 
       SET name = $1, system_prompt = $2, user_prompt = $3, note_type = $4, updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING id, name, system_prompt, user_prompt, note_type, created_at, updated_at`,
      [name, systemPrompt, userPrompt || null, noteType || "both", promptId, userId]
    );

    const updatedPrompt = result.rows[0];

    // Log data modification
    await auditService.logDataModify(
      userId,
      "custom_prompts",
      promptId,
      "update",
      `Previous name: ${existingPrompt.rows[0].name}`,
      `Updated custom prompt: ${name}`
    );

    res.json({
      success: true,
      prompt: updatedPrompt,
      message: "Custom prompt updated successfully",
    });
  } catch (error) {
    console.error("Update custom prompt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update custom prompt",
      error: error.message,
    });
  }
});

// Delete a custom prompt
router.delete("/:promptId", authenticateToken, async (req, res) => {
  try {
    const { promptId } = req.params;
    const userId = req.user.userId;

    // Check if prompt exists and belongs to user
    const existingPrompt = await pool.query(
      `SELECT id, name FROM custom_prompts WHERE id = $1 AND user_id = $2`,
      [promptId, userId]
    );

    if (existingPrompt.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Custom prompt not found",
      });
    }

    await pool.query(
      `DELETE FROM custom_prompts WHERE id = $1 AND user_id = $2`,
      [promptId, userId]
    );

    // Log data modification
    await auditService.logDataModify(
      userId,
      "custom_prompts",
      promptId,
      "delete",
      `Deleted custom prompt: ${existingPrompt.rows[0].name}`,
      null
    );

    res.json({
      success: true,
      message: "Custom prompt deleted successfully",
    });
  } catch (error) {
    console.error("Delete custom prompt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete custom prompt",
      error: error.message,
    });
  }
});

module.exports = router;
