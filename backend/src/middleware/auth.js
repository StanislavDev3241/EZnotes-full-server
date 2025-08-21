const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Access token required",
      message: "Authentication token is required to access this resource",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    );

    // Get user from database with is_active check
    const userResult = await pool.query(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid token",
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: "Account deactivated",
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired",
        message: "Your session has expired. Please log in again.",
      });
    }
    return res.status(403).json({
      success: false,
      error: "Invalid token",
      message: "Invalid authentication token",
    });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
};

// Check if user owns the resource or is admin
const requireOwnershipOrAdmin = (resourceUserId) => {
  return (req, res, next) => {
    if (req.user.role === "admin" || req.user.id === resourceUserId) {
      next();
    } else {
      res.status(403).json({ error: "Access denied" });
    }
  };
};

// Optional authentication - allows requests with or without token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    // No token provided, continue without authentication
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_super_secret_jwt_key_here"
    );

    // Get user from database with is_active check
    const userResult = await pool.query(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      // Invalid token, continue without authentication
      req.user = null;
      return next();
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      // Inactive user, continue without authentication
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    // Token error, continue without authentication
    console.error("Optional auth token error:", error);
    req.user = null;
    next();
  }
};

// Rate limiting middleware
const rateLimit = require("express-rate-limit");

const createRateLimiter = (windowMs, maxRequests) => {
  return rateLimit({
    windowMs: windowMs || 15 * 60 * 1000, // 15 minutes default
    max: maxRequests || 100, // limit each IP to 100 requests per windowMs
    message: {
      error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  createRateLimiter,
};
