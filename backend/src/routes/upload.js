const express = require("express");
const { optionalAuth } = require("../middleware/auth");
const {
  upload,
  uploadChunk, // Add chunk upload middleware
  handleUploadError,
  cleanupTempFile,
  moveToUploads,
} = require("../middleware/upload");

// Create a multer instance for parsing FormData without files (for finalize endpoint)
const multer = require("multer");
const finalizeParser = multer().none();
const { pool } = require("../config/database");
const { fileProcessingQueue } = require("../config/queue");
const path = require("path");
const fs = require("fs").promises; // Use native fs promises
const fetch = require("node-fetch"); // Add fetch for Node.js compatibility

const router = express.Router();

// Function to send file to Make.com for AI processing
const sendToMakeCom = async (fileInfo, fileId) => {
  const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!makeWebhookUrl) {
    console.warn(
      "⚠️ MAKE_WEBHOOK_URL not configured - skipping Make.com integration"
    );
    return { status: "no_webhook" };
  }

  try {
    const fileUrl = `${
      process.env.BACKEND_URL || "http://localhost:3001"
    }/uploads/${fileInfo.filename}`;

    const webhookPayload = {
      fileId,
      fileUrl,
      originalName: fileInfo.originalName,
      fileSize: fileInfo.fileSize,
      fileType: fileInfo.fileType,
      timestamp: new Date().toISOString(),
    };

    console.log(`📤 Sending to Make.com webhook:`, {
      url: makeWebhookUrl,
      payload: webhookPayload,
    });

    const response = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    if (response.ok) {
      console.log(
        `✅ File sent to Make.com successfully: ${fileInfo.filename}`
      );
      const makeResponse = await response.json();
      console.log(`📋 Make.com response:`, makeResponse);
      return makeResponse;
    } else {
      console.error(
        `❌ Failed to send file to Make.com: ${response.status} ${response.statusText}`
      );
      throw new Error(
        `Make.com webhook failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.error(`❌ Error sending file to Make.com:`, error);
    throw error;
  }
};

// File upload endpoint - allows both authenticated and anonymous uploads
router.post("/", optionalAuth, upload.single("file"), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { file } = req;
    tempFilePath = file.path;

    // File info
    const fileInfo = {
      filename: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      userId: null, // Will be set below
    };

    // Handle anonymous uploads (no user authentication)
    let userId = null;
    if (req.user) {
      userId = req.user.id;
      fileInfo.userId = userId;
      console.log(
        `📁 Authenticated upload by user ${req.user.email}: ${fileInfo.originalName} (${fileInfo.filename})`
      );
    } else {
      console.log(
        `📁 Anonymous upload: ${fileInfo.originalName} (${fileInfo.filename})`
      );
    }

    console.log(
      `📁 File uploaded: ${fileInfo.originalName} (${fileInfo.filename})`
    );

    // Move file from temp to uploads directory
    const uploadPath = await moveToUploads(tempFilePath, fileInfo.filename);
    tempFilePath = null; // Clear temp path since file was moved

    // Save file info to database
    let fileResult;
    try {
      fileResult = await pool.query(
        `
        INSERT INTO files (filename, original_name, file_path, file_size, file_type, user_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
        RETURNING id
      `,
        [
          fileInfo.filename,
          fileInfo.originalName,
          uploadPath,
          fileInfo.fileSize,
          fileInfo.fileType,
          userId,
        ]
      );
    } catch (dbError) {
      console.error("Database error saving file:", dbError);
      throw new Error(`Failed to save file to database: ${dbError.message}`);
    }

    const fileId = fileResult.rows[0].id;

    // Create task in database
    try {
      await pool.query(
        `
        INSERT INTO tasks (file_id, user_id, task_type, status, priority)
        VALUES ($1, $2, 'file_processing', 'pending', 1)
      `,
        [fileId, userId]
      );
    } catch (dbError) {
      console.error("Database error creating task:", dbError);
      throw new Error(`Failed to create task: ${dbError.message}`);
    }

    // Send to Make.com for AI processing
    try {
      const makeResponse = await sendToMakeCom(fileInfo, fileId);
      console.log("✅ File sent to Make.com successfully");

      // Update task status based on Make.com response
      if (makeResponse.soap_note_text || makeResponse.patient_summary_text) {
        // AI processing completed immediately
        console.log("🎉 AI processing completed immediately");

        // Save notes to database
        const notes = {
          soapNote: makeResponse.soap_note_text || "",
          patientSummary: makeResponse.patient_summary_text || "",
        };

        await pool.query(
          `INSERT INTO notes (file_id, soap_note, patient_summary, user_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
          [fileId, notes.soapNote, notes.patientSummary, userId]
        );

        // Update file and task status
        await pool.query(
          `UPDATE files SET status = 'processed' WHERE id = $1`,
          [fileId]
        );
        await pool.query(
          `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
          [fileId]
        );

        return res.json({
          success: true,
          file: { id: fileId, status: "processed" },
          notes: notes,
        });
      } else if (makeResponse.status === "success" && makeResponse.notes) {
        // Expected format response
        console.log("🎉 AI processing completed with expected format");

        const notes = makeResponse.notes;
        await pool.query(
          `INSERT INTO notes (file_id, soap_note, patient_summary, user_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
          [fileId, notes.soapNote || "", notes.patientSummary || "", userId]
        );

        await pool.query(
          `UPDATE files SET status = 'processed' WHERE id = $1`,
          [fileId]
        );
        await pool.query(
          `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
          [fileId]
        );

        return res.json({
          success: true,
          file: { id: fileId, status: "processed" },
          notes: notes,
        });
      } else {
        // Still processing
        console.log("⏳ AI processing in progress, updating status");
        await pool.query(
          `UPDATE tasks SET status = 'sent_to_make' WHERE file_id = $1`,
          [fileId]
        );
      }
    } catch (makeError) {
      console.error("❌ Error sending to Make.com:", makeError);
      // Don't fail the upload, just log the error
      // The file can still be processed later via webhook
    }

    // Return success response
    res.json({
      success: true,
      file: { id: fileId, status: "uploaded" },
      message: "File uploaded successfully and sent for AI processing",
    });
  } catch (error) {
    console.error("❌ Upload error:", error);

    // Clean up temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.remove(tempFilePath);
        console.log("🧹 Temp file cleaned up");
      } catch (cleanupError) {
        console.error("❌ Error cleaning up temp file:", cleanupError);
      }
    }

    res.status(500).json({
      error: "Upload failed",
      message: error.message || "An error occurred during file upload",
    });
  }
});

// Chunked upload endpoint for large files
router.post(
  "/chunk",
  optionalAuth,
  uploadChunk.single("chunk"),
  async (req, res) => {
    try {
      console.log("🔍 Chunk endpoint called with:");
      console.log("  - req.file:", req.file);
      console.log("  - req.files:", req.files);
      console.log("  - req.body:", req.body);
      console.log("  - req.headers:", req.headers);

      if (!req.file) {
        return res.status(400).json({
          error: "Missing chunk file",
          received: req.files ? Object.keys(req.files) : [],
          body: Object.keys(req.body),
          file: req.file,
          headers: Object.keys(req.headers),
        });
      }

      const chunkFile = req.file;
      const {
        chunkIndex,
        fileId,
        totalChunks,
        fileName,
        chunkSize,
        chunkStart,
        chunkEnd,
      } = req.body;

      console.log("📋 Parsed chunk metadata:", {
        chunkIndex,
        fileId,
        totalChunks,
        fileName,
        chunkSize,
        chunkStart,
        chunkEnd,
      });

      if (!chunkIndex || !fileId || !fileName) {
        return res.status(400).json({
          error: "Missing required chunk metadata",
          received: {
            chunkIndex,
            fileId,
            fileName,
            chunkSize,
            chunkStart,
            chunkEnd,
          },
        });
      }

      console.log(
        `📁 Received chunk ${chunkIndex}/${totalChunks} for file ${fileName}: ${(
          chunkFile.size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );

      // Create temp directory for chunks if it doesn't exist
      const chunksDir = path.join(__dirname, "../../temp/chunks", fileId);
      try {
        await fs.mkdir(chunksDir, { recursive: true });
        console.log(`📁 Created chunks directory: ${chunksDir}`);
      } catch (mkdirError) {
        console.error("❌ Error creating chunks directory:", mkdirError);
        return res.status(500).json({
          error: "Failed to create chunks directory",
          message: mkdirError.message,
        });
      }

      // Save chunk to temp directory
      const chunkPath = path.join(chunksDir, `chunk_${chunkIndex}`);

      // Handle both Buffer and File data
      let chunkBuffer;

      // Debug the chunk file structure
      console.log("🔍 Chunk file structure:", {
        hasBuffer: !!chunkFile.buffer,
        hasData: !!chunkFile.data,
        isBuffer: Buffer.isBuffer(chunkFile),
        type: typeof chunkFile,
        keys: Object.keys(chunkFile),
        size: chunkFile.size,
        path: chunkFile.path,
        destination: chunkFile.destination,
        filename: chunkFile.filename,
      });

      if (chunkFile.buffer && Buffer.isBuffer(chunkFile.buffer)) {
        // Multer memory storage - file object with buffer
        chunkBuffer = chunkFile.buffer;
        console.log("📦 Using chunkFile.buffer (memory storage)");
      } else if (chunkFile.data && Buffer.isBuffer(chunkFile.data)) {
        // Multer file object with data
        chunkBuffer = chunkFile.data;
        console.log("📦 Using chunkFile.data");
      } else if (Buffer.isBuffer(chunkFile)) {
        // Direct Buffer
        chunkBuffer = chunkFile;
        console.log("📦 Using direct Buffer");
      } else if (chunkFile.path && chunkFile.filename) {
        // Multer disk storage - read file from disk
        try {
          console.log(`📁 Reading chunk from disk: ${chunkFile.path}`);
          chunkBuffer = await fs.readFile(chunkFile.path);
          console.log("📦 Successfully read chunk from disk");

          // Clean up the temporary file after reading
          try {
            await fs.unlink(chunkFile.path);
            console.log("🗑️ Cleaned up temporary chunk file");
          } catch (cleanupError) {
            console.warn(
              "⚠️ Failed to cleanup temporary chunk file:",
              cleanupError.message
            );
          }
        } catch (readError) {
          console.error("❌ Failed to read chunk file from disk:", readError);
          return res.status(500).json({
            error: "Failed to read chunk file",
            message: readError.message,
          });
        }
      } else if (chunkFile.buffer && typeof chunkFile.buffer === "object") {
        // Handle case where buffer might be a different object type
        try {
          chunkBuffer = Buffer.from(chunkFile.buffer);
          console.log("📦 Converted chunkFile.buffer to Buffer");
        } catch (convertError) {
          console.error("❌ Failed to convert buffer to Buffer:", convertError);
          return res.status(500).json({
            error: "Invalid chunk data format",
            message: "Could not convert chunk data to buffer",
          });
        }
      } else {
        // Try to convert other formats
        try {
          chunkBuffer = Buffer.from(chunkFile);
          console.log("📦 Using Buffer.from conversion");
        } catch (convertError) {
          console.error(
            "❌ Failed to convert chunkFile to Buffer:",
            convertError
          );
          return res.status(500).json({
            error: "Invalid chunk data format",
            message: "Could not convert chunk data to buffer",
          });
        }
      }

      // Verify we have valid buffer data
      if (!chunkBuffer || !Buffer.isBuffer(chunkBuffer)) {
        console.error("❌ Invalid chunk buffer:", chunkBuffer);
        return res.status(500).json({
          error: "Invalid chunk data",
          message: "Chunk data is not a valid buffer",
        });
      }

      console.log(`📦 Chunk buffer size: ${chunkBuffer.length} bytes`);

      try {
        await fs.writeFile(chunkPath, chunkBuffer);
        console.log(
          `✅ Chunk ${chunkIndex}/${totalChunks} saved for file ${fileName}`
        );
      } catch (writeError) {
        console.error("❌ Error writing chunk file:", writeError);
        return res.status(500).json({
          error: "Failed to save chunk",
          message: writeError.message,
        });
      }

      res.json({
        success: true,
        chunkIndex: parseInt(chunkIndex),
        chunkSize: chunkFile.size,
        message: `Chunk ${chunkIndex} uploaded successfully`,
      });
    } catch (error) {
      console.error("❌ Chunk upload error:", error);
      res.status(500).json({
        error: "Chunk upload failed",
        message: error.message || "An error occurred during chunk upload",
      });
    }
  }
);

// Finalize chunked upload
router.post("/finalize", optionalAuth, finalizeParser, async (req, res) => {
  try {
    // Debug the request body
    console.log("🔍 Finalize endpoint called with:");
    console.log("  - req.body:", req.body);
    console.log("  - req.headers:", req.headers);
    console.log("  - Content-Type:", req.headers["content-type"]);
    
    // Check if we have a body parser issue
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log("⚠️ Request body is empty or undefined");
      return res.status(400).json({ 
        error: "Request body is empty",
        contentType: req.headers["content-type"],
        body: req.body
      });
    }
    
    // Parse FormData manually since we're not using multer for this endpoint
    const { fileId, fileName, fileSize, action } = req.body;

    console.log("📋 Parsed parameters:", { fileId, fileName, fileSize, action });
    
    if (!action) {
      return res.status(400).json({ 
        error: "Missing action parameter",
        received: req.body,
        action: action 
      });
    }
    
    if (action !== "finalize") {
      return res.status(400).json({ 
        error: "Invalid action",
        received: action,
        expected: "finalize"
      });
    }

    const chunksDir = path.join(__dirname, "../../temp/chunks", fileId);

    // Check if chunks directory exists
    try {
      await fs.access(chunksDir);
    } catch (accessError) {
      return res.status(400).json({ error: "No chunks found for this file" });
    }

    // Get all chunk files and sort them
    const chunkFiles = await fs.readdir(chunksDir);
    const sortedChunks = chunkFiles
      .filter((file) => file.startsWith("chunk_"))
      .sort((a, b) => {
        const aIndex = parseInt(a.replace("chunk_", ""));
        const bIndex = parseInt(b.replace("chunk_", ""));
        return aIndex - bIndex;
      });

    if (sortedChunks.length === 0) {
      return res.status(400).json({ error: "No valid chunks found" });
    }

    console.log(
      `🎯 Reassembling file from ${sortedChunks.length} chunks: ${fileName}`
    );

    // Combine chunks into final file
    const finalFilePath = path.join(
      __dirname,
      "../../temp",
      `${fileId}_${fileName}`
    );

    // Use native fs writeFile instead of streams for better error handling
    let totalSize = 0;
    const chunkBuffers = [];

    for (const chunkFile of sortedChunks) {
      const chunkPath = path.join(chunksDir, chunkFile);
      try {
        const chunkData = await fs.readFile(chunkPath);
        chunkBuffers.push(chunkData);
        totalSize += chunkData.length;

        console.log(
          `📁 Added chunk ${chunkFile}: ${(
            chunkData.length /
            1024 /
            1024
          ).toFixed(2)}MB`
        );
      } catch (readError) {
        console.error(`❌ Error reading chunk ${chunkFile}:`, readError);
        return res.status(500).json({
          error: "Failed to read chunk",
          message: `Error reading chunk ${chunkFile}: ${readError.message}`,
        });
      }
    }

    // Combine all chunks into one buffer
    const finalBuffer = Buffer.concat(chunkBuffers);

    try {
      await fs.writeFile(finalFilePath, finalBuffer);
      console.log(
        `🎯 Chunked upload finalized: ${fileName} (${(
          totalSize /
          1024 /
          1024
        ).toFixed(2)}MB)`
      );
    } catch (writeError) {
      console.error("❌ Error writing final file:", writeError);
      return res.status(500).json({
        error: "Failed to write final file",
        message: writeError.message,
      });
    }

    // Move to uploads directory
    const uploadPath = await moveToUploads(
      finalFilePath,
      `${fileId}_${fileName}`
    );

    // Save to database (similar to regular upload)
    let userId = null;
    if (req.user) {
      userId = req.user.id;
    }

    const fileResult = await pool.query(
      `INSERT INTO files (filename, original_name, file_path, file_size, file_type, user_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
       RETURNING id`,
      [
        `${fileId}_${fileName}`,
        fileName,
        uploadPath,
        totalSize,
        "application/octet-stream", // Generic type for chunked files
        userId,
      ]
    );

    const fileId_db = fileResult.rows[0].id;

    // Create task
    await pool.query(
      `INSERT INTO tasks (file_id, user_id, task_type, status, priority)
       VALUES ($1, $2, 'file_processing', 'pending', 1)`,
      [fileId_db, userId]
    );

    // Clean up chunks
    try {
      // Remove all chunk files
      for (const chunkFile of sortedChunks) {
        const chunkPath = path.join(chunksDir, chunkFile);
        await fs.unlink(chunkPath);
      }
      // Remove chunks directory
      await fs.rmdir(chunksDir);
      // Remove final temp file
      await fs.unlink(finalFilePath);
      console.log("🧹 Cleaned up temporary files");
    } catch (cleanupError) {
      console.warn(
        "⚠️ Warning: Could not clean up some temporary files:",
        cleanupError
      );
      // Don't fail the operation if cleanup fails
    }

    console.log(
      `✅ File reassembled and saved to database with ID: ${fileId_db}`
    );

    // Send to Make.com for AI processing
    try {
      console.log(`📤 Sending reassembled file to Make.com for AI processing`);

      const fileInfo = {
        filename: `${fileId}_${fileName}`,
        originalName: fileName,
        fileSize: totalSize,
        fileType: "application/octet-stream",
        userId: userId,
      };

      const makeResponse = await sendToMakeCom(fileInfo, fileId_db);

      if (makeResponse.status === "no_webhook") {
        console.log(
          "⚠️ Make.com webhook not configured - file saved but not processed"
        );
      } else {
        console.log("✅ File sent to Make.com successfully for AI processing");

        // Update task status to sent_to_make
        await pool.query(
          `UPDATE tasks SET status = 'sent_to_make' WHERE file_id = $1`,
          [fileId_db]
        );

        console.log("📋 Task status updated to 'sent_to_make'");
      }
    } catch (makeError) {
      console.error("❌ Error sending file to Make.com:", makeError);
      // Don't fail the finalization if Make.com fails
      // The file is still saved and can be processed later
    }

    res.json({
      success: true,
      file: { id: fileId_db, status: "uploaded" },
      message:
        "Chunked upload finalized successfully and sent for AI processing",
    });
  } catch (error) {
    console.error("❌ Finalize chunked upload error:", error);
    res.status(500).json({
      error: "Finalization failed",
      message: error.message || "An error occurred during finalization",
    });
  }
});

// Get upload status
router.get("/status/:fileId", optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    console.log(`📊 Status check for file ${fileId}:`, {
      userId: req.user ? req.user.id : "anonymous",
      isAuthenticated: !!req.user,
    });

    // For anonymous users, allow checking files with null user_id
    // For authenticated users, require user_id match
    let fileResult;
    if (req.user) {
      // Authenticated user - check their own files
      console.log(
        `🔐 Authenticated user ${req.user.id} checking file ${fileId}`
      );
      fileResult = await pool.query(
        `
        SELECT f.*, t.status as task_status, t.error_message
        FROM files f
        LEFT JOIN tasks t ON f.id = t.file_id AND t.task_type = 'file_processing'
        WHERE f.id = $1 AND f.user_id = $2
      `,
        [fileId, req.user.id]
      );
    } else {
      // Anonymous user - check files with null user_id
      console.log(`👤 Anonymous user checking file ${fileId}`);
      fileResult = await pool.query(
        `
        SELECT f.*, t.status as task_status, t.error_message
        FROM files f
        LEFT JOIN tasks t ON f.id = t.file_id AND t.task_type = 'file_processing'
        WHERE f.id = $1 AND f.user_id IS NULL
      `,
        [fileId]
      );
    }

    console.log(`📋 File lookup result:`, {
      fileId,
      rowsFound: fileResult.rows.length,
      fileData: fileResult.rows[0]
        ? {
            id: fileResult.rows[0].id,
            userId: fileResult.rows[0].user_id,
            status: fileResult.rows[0].status,
            taskStatus: fileResult.rows[0].task_status,
          }
        : null,
    });

    if (fileResult.rows.length === 0) {
      console.log(
        `❌ File ${fileId} not found for user:`,
        req.user ? req.user.id : "anonymous"
      );
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];
    console.log(
      `✅ File ${fileId} found, status:`,
      file.status,
      "task status:",
      file.task_status
    );

    res.json({
      file: {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        fileSize: file.file_size,
        fileType: file.file_type,
        status: file.status,
        taskStatus: file.task_status,
        errorMessage: file.error_message,
        createdAt: file.created_at,
      },
    });
  } catch (error) {
    console.error("Get upload status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete uploaded file (HIPAA compliance)
router.delete("/:fileId", optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info
    const fileResult = await pool.query(
      `
      SELECT * FROM files WHERE id = $1 AND user_id = $2
    `,
      [fileId, req.user ? req.user.id : null] // Pass null for anonymous users
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];

    // Delete physical file
    if (fs.existsSync(file.file_path)) {
      await fs.remove(file.file_path);
      console.log(`🗑️ Deleted file: ${file.file_path}`);
    }

    // Delete from database
    await pool.query("DELETE FROM files WHERE id = $1", [fileId]);
    await pool.query("DELETE FROM tasks WHERE file_id = $1", [fileId]);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
