const crypto = require("crypto");

class EncryptionUtils {
  constructor() {
    // Master encryption key from environment (should be 32 bytes for AES-256)
    this.masterKey =
      process.env.MASTER_ENCRYPTION_KEY ||
      crypto.randomBytes(32).toString("hex");
  }

  // Generate user-specific encryption key from user ID
  generateUserKey(userId) {
    const userString = userId.toString();
    const hash = crypto
      .createHash("sha256")
      .update(userString + this.masterKey)
      .digest();
    return hash;
  }

  // Encrypt data for a specific user
  encryptData(data, userId) {
    try {
      const userKey = this.generateUserKey(userId);
      const iv = crypto.randomBytes(16); // Initialization vector

      const cipher = crypto.createCipher("aes-256-cbc", userKey);
      let encrypted = cipher.update(data, "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        encryptedData: encrypted,
        iv: iv.toString("hex"),
        algorithm: "aes-256-cbc",
      };
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  // Decrypt data for a specific user
  decryptData(encryptedData, iv, userId) {
    try {
      const userKey = this.generateUserKey(userId);
      const decipher = crypto.createDecipher("aes-256-cbc", userKey);

      let decrypted = decipher.update(encryptedData, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }

  // Hash data for integrity checking
  hashData(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  // Generate secure random string
  generateSecureId() {
    return crypto.randomBytes(16).toString("hex");
  }
}

module.exports = new EncryptionUtils();
