const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");

// Ensure upload directories exist
const uploadDir = process.env.UPLOAD_PATH || "./uploads";
const tempDir = process.env.TEMP_PATH || "./temp";

// Create directories synchronously on startup
try {
  if (!fsSync.existsSync(uploadDir)) {
    fsSync.mkdirSync(uploadDir, { recursive: true });
  }
  if (!fsSync.existsSync(tempDir)) {
    fsSync.mkdirSync(tempDir, { recursive: true });
  }
} catch (error) {
  console.error("❌ Error creating directories:", error);
}

// File filter function
const fileFilter = (req, file, cb) => {
  // Allowed file types (more permissive for audio files)
  const allowedTypes = [
    "audio/mpeg",
    "audio/mp3", // Common MP3 MIME type
    "audio/mp4",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/x-m4a",
    "text/plain",
    "application/octet-stream", // Generic type for chunked files
  ];

  // Allowed file extensions
  const allowedExtensions = [".mp3", ".m4a", ".wav", ".txt"];

  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isValidType =
    allowedTypes.includes(file.mimetype) ||
    file.mimetype.startsWith("audio/") || // Accept any audio type
    file.mimetype === "application/octet-stream"; // Accept generic types

  // Special handling for chunk files (they have no extension but are valid)
  const isChunkFile =
    file.originalname.startsWith("chunk_") &&
    file.mimetype === "application/octet-stream";
  const isValidExtension =
    allowedExtensions.includes(fileExtension) || isChunkFile;

  console.log(`🔍 File validation:`, {
    filename: file.originalname,
    mimetype: file.mimetype,
    extension: fileExtension,
    isValidType,
    isValidExtension,
    isChunkFile,
  });

  if (isValidType && isValidExtension) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${allowedExtensions.join(
          ", "
        )}. Got: ${file.mimetype}`
      ),
      false
    );
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in temp directory first
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(file.originalname);
    const filename = `${timestamp}_${randomString}${fileExtension}`;
    cb(null, filename);
  },
});

// Multer configuration for regular uploads (with file filtering)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "200") * 1024 * 1024, // Convert MB to bytes (increased to 200MB)
    files: 1, // Only allow 1 file per request
    fieldSize: 1024 * 1024, // 1MB for field data
  },
  preserveExtension: true,
  fileSize: parseInt(process.env.MAX_FILE_SIZE || "200") * 1024 * 1024,
});

// Multer configuration for chunks (no file filtering needed)
const uploadChunk = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "200") * 1024 * 1024,
    files: 1,
    fieldSize: 1024 * 1024,
  },
  preserveExtension: true,
  fileSize: parseInt(process.env.MAX_FILE_SIZE || "200") * 1024 * 1024,
});

// Add progress tracking middleware
const uploadProgress = (req, res, next) => {
  if (req.file) {
    console.log(
      `📁 Upload progress: ${req.file.originalname} (${(
        req.file.size /
        1024 /
        1024
      ).toFixed(2)}MB)`
    );
  }
  next();
};

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message: `File size exceeds the limit of ${
          process.env.MAX_FILE_SIZE || "200MB"
        }. Please compress your file or use a smaller one.`,
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Too many files",
        message: "Only one file is allowed per request",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Unexpected file field",
        message: 'File field name must be "file"',
      });
    }
    if (error.code === "LIMIT_FIELD_COUNT") {
      return res.status(400).json({
        error: "Too many fields",
        message: "Too many form fields in the request",
      });
    }
    if (error.code === "LIMIT_FIELD_SIZE") {
      return res.status(400).json({
        error: "Field too large",
        message: "One of the form fields is too large",
      });
    }
  }

  if (error.message && error.message.includes("Invalid file type")) {
    return res.status(400).json({
      error: "Invalid file type",
      message: error.message,
    });
  }

  // Handle connection reset errors
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
    return res.status(408).json({
      error: "Upload timeout",
      message:
        "The upload connection was reset. This often happens with large files. Please try again or use a smaller file.",
    });
  }

  // Generic error
  console.error("Upload error:", error);
  return res.status(500).json({
    error: "Upload failed",
    message: "An error occurred during file upload. Please try again.",
  });
};

// Cleanup temporary files
const cleanupTempFile = async (filePath) => {
  try {
    if (filePath && fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
      console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error cleaning up temporary file ${filePath}:`, error);
  }
};

// Move file from temp to uploads directory
const moveToUploads = async (tempPath, filename) => {
  try {
    const uploadPath = path.join(uploadDir, filename);
    await fs.rename(tempPath, uploadPath);
    return uploadPath;
  } catch (error) {
    console.error(`❌ Error moving file from temp to uploads:`, error);
    throw error;
  }
};

module.exports = {
  upload,
  uploadChunk, // Add chunk upload middleware
  handleUploadError,
  cleanupTempFile,
  moveToUploads,
  uploadDir,
  tempDir,
};
