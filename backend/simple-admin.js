// Simple bcrypt hash generator for admin password
const crypto = require("crypto");

// Generate a simple hash for development (not production secure)
const password = "admin_secure_password_2024";
const salt = "clearlyai_salt_2024";
const hash = crypto
  .createHash("sha256")
  .update(password + salt)
  .digest("hex");

console.log("🔐 Admin User Credentials Generated:");
console.log("📧 Email: cmesmile50@gmail.com");
console.log("🔑 Password:", password);
console.log("🔒 Password Hash:", hash);
console.log("");
console.log("📝 SQL Commands:");
console.log("-- First, clear existing admin user");
console.log("DELETE FROM users WHERE email = 'cmesmile50@gmail.com';");
console.log("");
console.log("-- Then insert new admin user");
console.log(
  "INSERT INTO users (email, password_hash, role) VALUES ('cmesmile50@gmail.com', '" +
    hash +
    "', 'admin');"
);
console.log("");
console.log("-- Or update existing user");
console.log(
  "UPDATE users SET password_hash = '" +
    hash +
    "', role = 'admin' WHERE email = 'cmesmile50@gmail.com';"
);
