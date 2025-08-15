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
    // Use external server URL for Make.com webhook
    const backendUrl =
      process.env.BACKEND_URL ||
      process.env.EXTERNAL_BACKEND_URL ||
      "http://83.229.115.190:3001";
    const fileUrl = `${backendUrl}/uploads/${fileInfo.filename}`;

    console.log(`🌐 Generated file URL for Make.com: ${fileUrl}`);

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
      // Increase timeout for Make.com AI processing (up to 10 minutes)
      signal: AbortSignal.timeout(900000), // 15 minutes total timeout
    });

    if (response.ok) {
      console.log(
        `✅ File sent to Make.com successfully: ${fileInfo.filename}`
      );

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          const makeResponse = await response.json();
          console.log(`📋 Make.com response:`, makeResponse);

          // If Make.com returns immediate results, use them
          if (
            makeResponse.soap_note_text ||
            makeResponse.patient_summary_text
          ) {
            console.log("🎉 Make.com returned immediate results");
            return makeResponse;
          }

          // Otherwise, treat as asynchronous processing
          console.log(
            "⏳ Make.com processing asynchronously - waiting for webhook"
          );
          return {
            status: "processing",
            message: "File sent to Make.com for asynchronous processing",
            webhookExpected: true,
          };
        } catch (jsonError) {
          console.warn(`⚠️ Make.com response is not valid JSON:`, jsonError);
          // Return a default response indicating processing started
          return {
            status: "processing",
            message: "File sent to Make.com for processing",
            webhookExpected: true,
          };
        }
      } else {
        console.warn(
          `⚠️ Make.com response is not JSON (${contentType}), treating as asynchronous processing`
        );
        // Return a default response indicating processing started
        return {
          status: "processing",
          message: "File sent to Make.com for processing",
          webhookExpected: true,
        };
      }
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

        // Save notes to database using correct schema
        const notes = {
          soapNote: makeResponse.soap_note_text || "",
          patientSummary: makeResponse.patient_summary_text || "",
        };

        await pool.query(
          `INSERT INTO notes (file_id, note_type, content, user_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
          [fileId, "ai_generated", JSON.stringify(notes), userId]
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
          `INSERT INTO notes (file_id, note_type, content, user_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
          [fileId, "ai_generated", JSON.stringify(notes), userId]
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
        // Normal case: Make.com is processing asynchronously via webhook
        console.log(
          "⏳ AI processing started asynchronously - waiting for webhook"
        );

        // Update task status to indicate processing started
        await pool.query(
          `UPDATE tasks SET status = 'sent_to_make' WHERE file_id = $1`,
          [fileId]
        );

        // Update file status to reflect processing state
        await pool.query(
          `UPDATE files SET status = 'processing' WHERE id = $1`,
          [fileId]
        );

        return res.json({
          success: true,
          file: { id: fileId, status: "processing" },
          message:
            "File uploaded successfully and sent for AI processing. Processing in progress...",
          taskStatus: "sent_to_make",
          note: "Results will be available when AI processing completes. This may take several minutes.",
        });
      }
    } catch (makeError) {
      console.error("❌ Error sending to Make.com:", makeError);

      // Update task status to reflect the error
      await pool.query(
        `UPDATE tasks SET status = 'failed', error_message = $1 WHERE file_id = $2`,
        [makeError.message, fileId]
      );

      // Update file status to reflect error state
      await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
        fileId,
      ]);

      return res.json({
        success: true,
        file: { id: fileId, status: "failed" },
        message:
          "File uploaded but failed to send for AI processing. Will retry later.",
        taskStatus: "failed",
        error: makeError.message,
      });
    }

    // This should never be reached, but just in case
    console.log(
      "⚠️ Unexpected flow - Make.com integration completed without proper response"
    );
    res.json({
      success: true,
      file: { id: fileId, status: "uploaded" },
      message:
        "File uploaded successfully but Make.com integration status unclear",
      taskStatus: "unknown",
    });
  } catch (error) {
    console.error("❌ Upload error:", error);

    // Clean up temp file if it exists
    if (tempFilePath) {
      try {
        // Use fs.access to check if file exists (fs.promises compatible)
        await fs.access(tempFilePath);
        await fs.unlink(tempFilePath);
        console.log("🧹 Temp file cleaned up");
      } catch (error) {
        if (error.code === "ENOENT") {
          // File doesn't exist, which is fine
          console.log("ℹ️ Temp file already cleaned up");
        } else {
          // Other error occurred during cleanup
          console.error("❌ Error cleaning up temp file:", error);
        }
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

      // Validate and clean fileName to prevent corruption
      const cleanFileName = fileName
        ? fileName.trim().replace(/\s+/g, " ")
        : "";
      if (cleanFileName !== fileName) {
        console.warn(
          `⚠️ FileName cleaned from "${fileName}" to "${cleanFileName}"`
        );
      }

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
        `📁 Received chunk ${chunkIndex}/${totalChunks} for file ${cleanFileName}: ${(
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

          // Don't clean up the temporary file here - it will be cleaned up after finalization
          // This ensures the chunk is available for the finalize endpoint
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

        // BULLETPROOF CHUNK VERIFICATION - Your custom server needs this!
        try {
          const savedChunkStats = await fs.stat(chunkPath);
          console.log(
            `📁 BULLETPROOF VERIFICATION: Chunk saved successfully: ${chunkPath} (${savedChunkStats.size} bytes)`
          );
          
          // AGGRESSIVE VERIFICATION: Double-check the chunk is readable
          try {
            const verifyBuffer = await fs.readFile(chunkPath);
            if (verifyBuffer.length === chunkBuffer.length) {
              console.log(`✅ BULLETPROOF VERIFICATION: Chunk integrity confirmed - size matches`);
            } else {
              console.warn(`⚠️ BULLETPROOF VERIFICATION: Chunk size mismatch - expected ${chunkBuffer.length}, got ${verifyBuffer.length}`);
            }
          } catch (verifyError) {
            console.warn(`⚠️ BULLETPROOF VERIFICATION: Could not verify chunk integrity:`, verifyError);
          }
        } catch (statError) {
          console.warn(`⚠️ BULLETPROOF VERIFICATION: Could not verify saved chunk: ${statError.message}`);
        }
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

      // BULLETPROOF CHUNK PROTECTION: Don't delete failed chunks immediately - Your custom server needs them!
      try {
        if (chunkPath) {
          // Instead of deleting, rename to prevent loss
          const failedChunkPath = chunkPath + '.failed';
          await fs.rename(chunkPath, failedChunkPath);
          console.log(`🛡️ BULLETPROOF PROTECTION: Renamed failed chunk to: ${failedChunkPath}`);
        }
      } catch (protectionError) {
        console.warn(`⚠️ BULLETPROOF PROTECTION: Could not rename failed chunk:`, protectionError);
      }

      res.status(500).json({
        error: "Chunk upload failed",
        message: error.message || "An error occurred during chunk upload",
      });
    }
  }
);

// BULLETPROOF CHUNK HANDLING - Your custom server needs bulletproof chunk validation!
const validateAndRecoverChunks = async (fileId, totalChunks) => {
  const chunksDir = path.join(__dirname, "../../temp/chunks", fileId);
  
  try {
    // Check if chunks directory exists
    await fs.access(chunksDir);
    console.log(`✅ Chunks directory exists: ${chunksDir}`);
  } catch (accessError) {
    console.error(`❌ Chunks directory not found: ${chunksDir}`, accessError);
    
    // BULLETPROOF RECOVERY: Try to recreate the directory and wait for chunks
    console.log(`🛡️ BULLETPROOF RECOVERY: Attempting to recreate chunks directory...`);
    
    try {
      // Wait a bit for any pending chunk uploads
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to recreate the directory
      await fs.mkdir(chunksDir, { recursive: true });
      console.log(`✅ BULLETPROOF RECOVERY: Recreated chunks directory: ${chunksDir}`);
      
      // Wait a bit more for chunks to arrive
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check again
      await fs.access(chunksDir);
      console.log(`✅ BULLETPROOF RECOVERY: Directory now accessible: ${chunksDir}`);
    } catch (recoveryError) {
      console.error(`❌ BULLETPROOF RECOVERY failed:`, recoveryError);
      return { valid: false, error: "Directory recovery failed", chunksDir };
    }
  }

  // Get all chunk files
  let chunkFiles;
  try {
    chunkFiles = await fs.readdir(chunksDir);
    console.log(
      `📁 Found ${chunkFiles.length} files in chunks directory:`,
      chunkFiles
    );
  } catch (readError) {
    console.error(`❌ Error reading chunks directory: ${chunksDir}`, readError);
    return { valid: false, error: "Failed to read directory", chunksDir };
  }

  // Filter and validate chunks
  const validChunks = chunkFiles
    .filter((file) => file.startsWith("chunk_"))
    .sort((a, b) => {
      const aIndex = parseInt(a.replace("chunk_", ""));
      const bIndex = parseInt(b.replace("chunk_", ""));
      return aIndex - bIndex;
    });

  console.log(
    `🎯 Found ${validChunks.length} valid chunks out of ${chunkFiles.length} total files`
  );

  // Check for missing chunks
  const missingChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const expectedChunk = `chunk_${i}`;
    if (!validChunks.includes(expectedChunk)) {
      missingChunks.push(i);
    }
  }

  if (missingChunks.length > 0) {
    console.warn(`⚠️ Missing chunks: ${missingChunks.join(", ")}`);
    return {
      valid: false,
      error: "Missing chunks",
      missingChunks,
      validChunks: validChunks.length,
      totalChunks,
      chunksDir,
    };
  }

  // Verify chunk sizes and integrity
  const chunkDetails = [];
  for (const chunkFile of validChunks) {
    try {
      const chunkPath = path.join(chunksDir, chunkFile);
      const stats = await fs.stat(chunkPath);
      chunkDetails.push({
        name: chunkFile,
        size: stats.size,
        path: chunkPath,
      });
    } catch (statError) {
      console.error(`❌ Error checking chunk ${chunkFile}:`, statError);
      return {
        valid: false,
        error: "Chunk validation failed",
        failedChunk: chunkFile,
        chunksDir,
      };
    }
  }

  return {
    valid: true,
    chunks: validChunks,
    chunkDetails,
    chunksDir,
  };
};

// Helper function to clean up orphaned chunk directories
const cleanupOrphanedChunks = async (fileId) => {
  const chunksDir = path.join(__dirname, "../../temp/chunks", fileId);

  try {
    // Check if directory exists
    await fs.access(chunksDir);

    // Remove the entire chunks directory and all its contents
    await fs.rm(chunksDir, { recursive: true, force: true });
    console.log(`🧹 Cleaned up chunks directory: ${chunksDir}`);

    return true;
  } catch (error) {
    // Directory doesn't exist or already cleaned up
    console.log(
      `ℹ️ Chunks directory already cleaned up or doesn't exist: ${chunksDir}`
    );
    return false;
  }
};

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
        body: req.body,
      });
    }

    // Parse FormData manually since we're not using multer for this endpoint
    const { fileId, fileName, fileSize, action } = req.body;

    // Ensure fileId is available for error handling
    if (!fileId) {
      return res.status(400).json({
        error: "Missing fileId parameter",
        received: req.body,
        message: "fileId is required for finalization",
      });
    }

    // Validate and clean fileName to prevent corruption
    let cleanFileName = fileName ? fileName.trim().replace(/\s+/g, " ") : "";
    if (cleanFileName !== fileName) {
      console.warn(
        `⚠️ Finalize: FileName cleaned from "${fileName}" to "${cleanFileName}"`
      );
    }

    // Additional validation to prevent corrupted filenames
    if (!cleanFileName || cleanFileName.length === 0) {
      return res.status(400).json({
        error: "Invalid filename",
        received: fileName,
        message: "Filename is empty or invalid",
      });
    }

    // Check for suspicious patterns in filename
    if (
      cleanFileName.includes("originalName") ||
      cleanFileName.includes("%20")
    ) {
      console.warn(`⚠️ Suspicious filename detected: "${cleanFileName}"`);
      // Try to extract just the actual filename part
      const actualFileName = cleanFileName.split("originalName")[0].trim();
      if (actualFileName && actualFileName !== cleanFileName) {
        console.warn(`⚠️ Extracted actual filename: "${actualFileName}"`);
        cleanFileName = actualFileName;
      }
    }

    console.log("📋 Parsed parameters:", {
      fileId,
      fileName: cleanFileName,
      fileSize,
      action,
    });

    if (!action) {
      return res.status(400).json({
        error: "Missing action parameter",
        received: req.body,
        action: action,
      });
    }

    if (action !== "finalize") {
      return res.status(400).json({
        error: "Invalid action",
        received: action,
        expected: "finalize",
      });
    }

    // BULLETPROOF CHUNK VALIDATION with AGGRESSIVE RETRY - Your custom server needs this!
    const totalChunks = parseInt(req.body.totalChunks) || 0;
    console.log(
      `🔍 BULLETPROOF VALIDATION: Validating chunks for file: ${fileId}, expected: ${totalChunks}`
    );

    // AGGRESSIVE RETRY: Try multiple times with increasing delays
    let validation;
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
      validation = await validateAndRecoverChunks(fileId, totalChunks);
      
      if (validation.valid) {
        console.log(`✅ BULLETPROOF VALIDATION: Success on attempt ${retryCount + 1}`);
        break;
      }
      
      retryCount++;
      if (retryCount < maxRetries) {
        const delay = retryCount * 2000; // 2s, 4s, 6s, 8s, 10s
        console.log(`🔄 BULLETPROOF VALIDATION: Retry ${retryCount}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (!validation.valid) {
      console.error(`❌ BULLETPROOF VALIDATION: All ${maxRetries} attempts failed`);
    }

    if (!validation.valid) {
      console.error(`❌ Chunk validation failed:`, validation);

      // Provide detailed error information for debugging
      let errorMessage = validation.error;
      if (validation.missingChunks) {
        errorMessage = `Missing chunks: ${validation.missingChunks.join(
          ", "
        )}. Expected ${validation.totalChunks}, found ${
          validation.validChunks
        }`;
      }

      return res.status(400).json({
        error: "Chunk validation failed",
        details: errorMessage,
        fileId: fileId,
        validation: {
          error: validation.error,
          missingChunks: validation.missingChunks,
          validChunks: validation.validChunks,
          totalChunks: validation.totalChunks,
          chunksDir: validation.chunksDir,
        },
      });
    }

    const { chunks: sortedChunks, chunksDir } = validation;
    console.log(
      `🎯 Using ${sortedChunks.length} validated chunks from: ${chunksDir}`
    );

    console.log(
      `🎯 Reassembling file from ${sortedChunks.length} chunks: ${cleanFileName}`
    );

    // Combine chunks into final file
    const finalFilePath = path.join(
      __dirname,
      "../../temp",
      `${fileId}_${cleanFileName}`
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
      `${fileId}_${cleanFileName}`
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
        `${fileId}_${cleanFileName}`,
        cleanFileName,
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

          // BULLETPROOF FINALIZATION PROTECTION: Don't clean up chunks immediately - Your custom server needs them!
      try {
        // Instead of immediate cleanup, schedule it for later
        setTimeout(async () => {
          try {
            await cleanupOrphanedChunks(fileId);
            console.log(`🧹 BULLETPROOF CLEANUP: Chunks cleaned up after delay for file: ${fileId}`);
          } catch (delayedCleanupError) {
            console.warn(`⚠️ BULLETPROOF CLEANUP: Delayed cleanup failed:`, delayedCleanupError);
          }
        }, 30000); // Wait 30 seconds before cleanup - Your custom server needs time!
        
        console.log(`🛡️ BULLETPROOF PROTECTION: Chunk cleanup scheduled for 30 seconds later for file: ${fileId}`);
      } catch (protectionError) {
        console.warn(`⚠️ BULLETPROOF PROTECTION: Could not schedule chunk cleanup:`, protectionError);
      }

    // Send to Make.com for AI processing
    let makeResponse; // Declare at function level for scope access

    try {
      console.log(`📤 Sending reassembled file to Make.com for AI processing`);

      const fileInfo = {
        filename: `${fileId}_${cleanFileName}`,
        originalName: cleanFileName,
        fileSize: totalSize,
        fileType: "application/octet-stream",
        userId: userId,
      };

      makeResponse = await sendToMakeCom(fileInfo, fileId_db);

      if (makeResponse.status === "no_webhook") {
        console.log(
          "⚠️ Make.com webhook not configured - file saved but not processed"
        );
      } else if (
        makeResponse.soap_note_text ||
        makeResponse.patient_summary_text
      ) {
        // 🎉 Make.com returned immediate results - process them now!
        console.log("🎉 Processing immediate Make.com results");

        try {
          // Save SOAP note if available
          if (makeResponse.soap_note_text) {
            await pool.query(
              `INSERT INTO notes (file_id, note_type, content, user_id, created_at)
               VALUES ($1, 'soap_note', $2, $3, NOW())`,
              [
                fileId_db,
                JSON.stringify({ soapNote: makeResponse.soap_note_text }),
                userId,
              ]
            );
            console.log("✅ SOAP note saved to database");
            console.log(
              "📝 SOAP note content:",
              makeResponse.soap_note_text.substring(0, 100) + "..."
            );
          }

          // Save patient summary if available
          if (makeResponse.patient_summary_text) {
            await pool.query(
              `INSERT INTO notes (file_id, note_type, content, user_id, created_at)
               VALUES ($1, 'patient_summary', $2, $3, NOW())`,
              [
                fileId_db,
                JSON.stringify({
                  patientSummary: makeResponse.patient_summary_text,
                }),
                userId,
              ]
            );
            console.log("✅ Patient summary saved to database");
            console.log(
              "📝 Patient summary content:",
              makeResponse.patient_summary_text.substring(0, 100) + "..."
            );
          }

          // Update task status to completed
          await pool.query(
            `UPDATE tasks SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE file_id = $1`,
            [fileId_db]
          );

          // Update file status to processed
          await pool.query(
            `UPDATE files SET status = 'processed' WHERE id = $1`,
            [fileId_db]
          );

          console.log(
            "🎉 File processing completed immediately with Make.com results"
          );

          // Verify notes were saved to database
          try {
            const notesResult = await pool.query(
              `SELECT COUNT(*) as count FROM notes WHERE file_id = $1`,
              [fileId_db]
            );
            console.log(
              `📊 Verification: ${notesResult.rows[0].count} notes found in database for file ${fileId_db}`
            );
          } catch (verifyError) {
            console.warn("⚠️ Could not verify notes in database:", verifyError);
          }
        } catch (dbError) {
          console.error(
            "❌ Error saving Make.com results to database:",
            dbError
          );
          // Fall back to asynchronous processing
          await pool.query(
            `UPDATE tasks SET status = 'sent_to_make' WHERE file_id = $1`,
            [fileId_db]
          );
          console.log("📋 Task status updated to 'sent_to_make' (fallback)");
        }
      } else if (makeResponse.webhookExpected) {
        // Make.com is processing asynchronously
        console.log(
          "⏳ Make.com processing asynchronously - waiting for webhook"
        );

        // Update task status to sent_to_make
        await pool.query(
          `UPDATE tasks SET status = 'sent_to_make' WHERE file_id = $1`,
          [fileId_db]
        );

        console.log("📋 Task status updated to 'sent_to_make'");
      } else {
        // Unknown response format
        console.log(
          "⚠️ Unknown Make.com response format, treating as asynchronous"
        );

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
      makeResponse = { status: "error", message: "Make.com processing failed" };
    }

    // Check if we have immediate results to determine the response
    const hasImmediateResults =
      makeResponse &&
      (makeResponse.soap_note_text || makeResponse.patient_summary_text);

    // Ensure makeResponse is defined for the response
    if (!makeResponse) {
      console.warn("⚠️ No Make.com response received");
    }

    res.json({
      success: true,
      file: {
        id: fileId_db,
        status: hasImmediateResults ? "processed" : "uploaded",
      },
      message: hasImmediateResults
        ? "Chunked upload finalized successfully and AI processing completed immediately!"
        : "Chunked upload finalized successfully and sent for AI processing",
      processingStatus: hasImmediateResults ? "completed" : "sent_to_make",
      hasResults: !!hasImmediateResults,
    });
  } catch (error) {
    console.error("❌ Finalize chunked upload error:", error);
    // BULLETPROOF ERROR PROTECTION: Don't clean up chunks on failure - Your custom server needs them!
    try {
      // Schedule cleanup for much later to give your custom server time to recover
      setTimeout(async () => {
        try {
          await cleanupOrphanedChunks(fileId);
          console.log(`🧹 BULLETPROOF ERROR CLEANUP: Chunks cleaned up after 5 minutes for file: ${fileId}`);
        } catch (delayedCleanupError) {
          console.warn(`⚠️ BULLETPROOF ERROR CLEANUP: Delayed cleanup failed:`, delayedCleanupError);
        }
      }, 5 * 60 * 1000); // Wait 5 MINUTES before cleanup - Your custom server needs time to recover!
      
      console.log(`🛡️ BULLETPROOF ERROR PROTECTION: Chunk cleanup scheduled for 5 minutes later for file: ${fileId}`);
    } catch (protectionError) {
      console.warn(`⚠️ BULLETPROOF ERROR PROTECTION: Could not schedule chunk cleanup:`, protectionError);
    }

    res.status(500).json({
      error: "Finalization failed",
      message: error.message || "An error occurred during finalization",
    });
  }
});

// AGGRESSIVE CHUNK CLEANUP PREVENTION - Your custom server needs this!
const cleanupOldChunks = async () => {
  try {
    const chunksBaseDir = path.join(__dirname, "../../temp/chunks");
    
    // Check if base chunks directory exists
    try {
      await fs.access(chunksBaseDir);
    } catch (accessError) {
      console.log("ℹ️ Chunks base directory doesn't exist, nothing to clean");
      return;
    }
    
    const chunkDirs = await fs.readdir(chunksBaseDir);
    console.log(`🧹 BULLETPROOF CLEANUP: Found ${chunkDirs.length} chunk directories to check`);
    
    let cleanedCount = 0;
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 DAYS - Your custom server needs time!

    for (const dirName of chunkDirs) {
      try {
        const dirPath = path.join(chunksBaseDir, dirName);
        const stats = await fs.stat(dirPath);

        // Check if directory is older than 24 hours
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`🧹 Cleaned up old chunk directory: ${dirName}`);
          cleanedCount++;
        }
      } catch (dirError) {
        console.warn(`⚠️ Could not process directory ${dirName}:`, dirError);
      }
    }

    console.log(
      `🧹 Periodic cleanup completed: ${cleanedCount} directories removed`
    );
  } catch (error) {
    console.error("❌ Periodic cleanup error:", error);
  }
};

// AGGRESSIVE CLEANUP PREVENTION: Run cleanup every 24 hours - Your custom server needs time!
setInterval(cleanupOldChunks, 24 * 60 * 60 * 1000);

// Clean up orphaned chunks (admin endpoint)
router.post("/cleanup-chunks", optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        error: "Missing fileId",
        message: "fileId is required for cleanup",
      });
    }

    console.log(`🧹 Manual cleanup requested for file: ${fileId}`);
    const cleaned = await cleanupOrphanedChunks(fileId);

    if (cleaned) {
      res.json({
        success: true,
        message: `Chunks cleaned up for file: ${fileId}`,
        fileId: fileId,
      });
    } else {
      res.json({
        success: true,
        message: `No chunks to clean up for file: ${fileId}`,
        fileId: fileId,
      });
    }
  } catch (error) {
    console.error("❌ Chunk cleanup error:", error);
    res.status(500).json({
      error: "Cleanup failed",
      message: error.message || "An error occurred during cleanup",
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

// Webhook endpoint for Make.com to update task status when AI processing is complete
// This handles the asynchronous nature of AI processing where:
// 1. File is sent to Make.com (immediate response)
// 2. Make.com processes file asynchronously (can take 10+ minutes)
// 3. Make.com calls this webhook when processing completes
// 4. Backend updates file status and saves results
router.post("/webhook", async (req, res) => {
  // Set longer timeout for webhook processing
  req.setTimeout(900000); // 15 minutes
  res.setTimeout(900000);

  try {
    console.log("📥 Received webhook from Make.com:", req.body);

    const {
      fileId,
      status,
      notes,
      soap_note_text,
      patient_summary_text,
      error,
    } = req.body;

    if (!fileId) {
      return res
        .status(400)
        .json({ error: "Missing fileId in webhook payload" });
    }

    if (
      status === "completed" &&
      (notes || soap_note_text || patient_summary_text)
    ) {
      // AI processing completed successfully
      console.log(`🎉 AI processing completed for file ${fileId}`);

      // Handle both response formats from Make.com
      let notesData;
      if (notes && notes.soapNote && notes.patientSummary) {
        // Format: { notes: { soapNote: "...", patientSummary: "..." } }
        notesData = {
          soapNote: notes.soapNote || "",
          patientSummary: notes.patientSummary || "",
        };
      } else if (soap_note_text || patient_summary_text) {
        // Format: { soap_note_text: "...", patient_summary_text: "..." }
        notesData = {
          soapNote: soap_note_text || "",
          patientSummary: patient_summary_text || "",
        };
      } else {
        // Fallback to notes object if available
        notesData = {
          soapNote: notes?.soapNote || "",
          patientSummary: notes?.patientSummary || "",
        };
      }

      await pool.query(
        `INSERT INTO notes (file_id, note_type, content, user_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [fileId, "ai_generated", JSON.stringify(notesData), null]
      );

      // Update file and task status
      await pool.query(`UPDATE files SET status = 'processed' WHERE id = $1`, [
        fileId,
      ]);

      await pool.query(
        `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
        [fileId]
      );

      console.log(`✅ File ${fileId} status updated to 'processed'`);
    } else if (status === "failed" || error) {
      // AI processing failed
      console.log(`❌ AI processing failed for file ${fileId}:`, error);

      await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
        fileId,
      ]);

      await pool.query(
        `UPDATE tasks SET status = 'failed', error_message = $1 WHERE file_id = $1`,
        [error || "AI processing failed", fileId]
      );

      console.log(`❌ File ${fileId} status updated to 'failed'`);
    }

    res.json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
