const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const router = express.Router();

// User Registration
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, created_at) 
       VALUES ($1, $2, $3, 'user', true, NOW()) 
       RETURNING id, name, email, role, created_at`,
      [name, email, hashedPassword]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser.rows[0].id,
        email: newUser.rows[0].email,
        role: newUser.rows[0].role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: newUser.rows[0].id,
        name: newUser.rows[0].name,
        email: newUser.rows[0].email,
        role: newUser.rows[0].role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// User Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await pool.query(
      "SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const userData = user.rows[0];

    // Check if user is active
    if (!userData.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(
      password,
      userData.password_hash
    );
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: userData.id,
        email: userData.email,
        role: userData.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Login
router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin user
    const admin = await pool.query(
      "SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1 AND role = $2",
      [email, "admin"]
    );

    if (admin.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const adminData = admin.rows[0];

    // Check if admin is active
    if (!adminData.is_active) {
      return res.status(401).json({
        success: false,
        message: "Admin account is deactivated",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(
      password,
      adminData.password_hash
    );
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: adminData.id,
        email: adminData.email,
        role: adminData.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Admin login successful",
      token,
      user: {
        id: adminData.id,
        name: adminData.name,
        email: adminData.email,
        role: adminData.role,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Verify User Token
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // Get user data
    const user = await pool.query(
      "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = user.rows[0];

    if (!userData.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    res.json({
      success: true,
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
});

// Verify Admin Token
router.get("/admin/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    if (decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    // Get admin data
    const admin = await pool.query(
      "SELECT id, name, email, role, is_active FROM users WHERE id = $1 AND role = $2",
      [decoded.userId, "admin"]
    );

    if (admin.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Admin not found",
      });
    }

    const adminData = admin.rows[0];

    if (!adminData.is_active) {
      return res.status(401).json({
        success: false,
        message: "Admin account is deactivated",
      });
    }

    res.json({
      success: true,
      user: {
        id: adminData.id,
        name: adminData.name,
        email: adminData.email,
        role: adminData.role,
      },
    });
  } catch (error) {
    console.error("Admin token verification error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid admin token",
    });
  }
});

module.exports = router;
