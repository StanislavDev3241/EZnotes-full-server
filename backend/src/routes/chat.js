const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openaiService");

const router = express.Router();

// Middleware to verify JWT token
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

// Chat with AI
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Simple AI response for now
    const response = await openaiService.chatWithAI(
      [], // Empty conversation history for now
      message,
      {} // No note context for now
    );

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

    // For now, return empty history
    // Later we'll implement chat history storage
    res.json({
      success: true,
      messages: [],
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

module.exports = router; 