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
const fs = require("fs"); // Regular fs for createReadStream
const fsPromises = require("fs").promises; // Promises for async operations
const openaiService = require("../services/openaiService");
const fsSync = require("fs"); // For createWriteStream
const encryptionUtils = require("../../encryption-utils");

const router = express.Router();

// ✅ NEW: Audio file header validation function
const validateAudioFileHeader = (buffer, fileType) => {
  try {
    // Check if buffer has minimum size for header validation
    if (buffer.length < 12) {
      console.warn(
        `⚠️ Buffer too small for header validation: ${buffer.length} bytes`
      );
      return false;
    }

    // MP3 file validation (ID3v2 or MPEG frame header)
    if (fileType === "audio/mpeg" || fileType === "audio/mp3") {
      // Check for ID3v2 header (starts with "ID3")
      if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        console.log(`✅ Valid MP3 ID3v2 header detected`);
        return true;
      }

      // Check for MPEG frame header (starts with 0xFF and has sync bits)
      if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
        console.log(`✅ Valid MP3 MPEG frame header detected`);
        return true;
      }

      console.warn(`⚠️ Invalid MP3 header detected`);
      return false;
    }

    // WAV file validation (starts with "RIFF")
    if (fileType === "audio/wav" || fileType === "audio/x-wav") {
      if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46
      ) {
        console.log(`✅ Valid WAV RIFF header detected`);
        return true;
      }

      console.warn(`⚠️ Invalid WAV header detected`);
      return false;
    }

    // M4A/AAC file validation (starts with "ftyp")
    if (
      fileType === "audio/mp4" ||
      fileType === "audio/m4a" ||
      fileType === "audio/aac"
    ) {
      // Check for "ftyp" box (usually at offset 4)
      if (
        buffer[4] === 0x66 &&
        buffer[5] === 0x74 &&
        buffer[6] === 0x79 &&
        buffer[7] === 0x70
      ) {
        console.log(`✅ Valid M4A/AAC ftyp header detected`);
        return true;
      }

      // Alternative: check for "M4A " signature
      if (
        buffer[8] === 0x4d &&
        buffer[9] === 0x34 &&
        buffer[10] === 0x41 &&
        buffer[11] === 0x20
      ) {
        console.log(`✅ Valid M4A signature detected`);
        return true;
      }

      console.warn(`⚠️ Invalid M4A/AAC header detected`);
      return false;
    }

    // For other audio types, do basic validation
    if (fileType.startsWith("audio/")) {
      // Check if file has reasonable size and isn't completely empty
      if (buffer.length > 100) {
        console.log(`✅ Basic audio file validation passed for ${fileType}`);
        return true;
      }
    }

    console.warn(`⚠️ Unsupported audio type or invalid header: ${fileType}`);
    return false;
  } catch (error) {
    console.error(`❌ Error during audio header validation:`, error);
    return false;
  }
};

// Enhanced file processing with OpenAI
const processFileWithOpenAI = async (
  fileInfo,
  fileId,
  userId,
  customPrompt = null
) => {
  try {
    console.log(`🤖 Processing file with OpenAI: ${fileInfo.filename}`);
    console.log(`🔍 Debug fileInfo:`, JSON.stringify(fileInfo, null, 2));
    console.log(`🔍 Debug fileInfo.filePath: ${fileInfo.filePath}`);
    console.log(`🔍 Debug fileInfo type: ${typeof fileInfo.filePath}`);

    let transcription = "";

    // Process file based on type
    if (fileInfo.fileType.startsWith("audio/")) {
      // Audio file - use Whisper API
      console.log(`🎵 Audio file detected, using Whisper API`);

      try {
        // ✅ SIMPLIFIED: Use universal prompt for all audio types
        transcription = await openaiService.transcribeAudio(fileInfo.filePath);
      } catch (transcriptionError) {
        console.error(`❌ Transcription failed:`, transcriptionError);

        // Handle specific transcription errors
        if (transcriptionError.message.includes("25MB")) {
          throw new Error(
            `File size exceeds Whisper API limit. Please use a smaller file or contact support for large file processing.`
          );
        } else if (transcriptionError.message.includes("API key")) {
          throw new Error(
            `OpenAI API configuration error. Please check your API key and try again.`
          );
        } else if (transcriptionError.message.includes("rate limit")) {
          throw new Error(
            `OpenAI API rate limit exceeded. Please try again in a few minutes.`
          );
        } else {
          throw new Error(
            `Transcription failed: ${transcriptionError.message}. Please try again or contact support.`
          );
        }
      }
    } else if (fileInfo.fileType === "text/plain") {
      // Text file - read content directly
      console.log(`📄 Text file detected, reading content directly`);
      transcription = await fsPromises.readFile(fileInfo.filePath, "utf8");
    } else {
      throw new Error(
        `Unsupported file type: ${fileInfo.fileType}. Supported types: audio files (MP3, WAV, M4A, AAC) and text files.`
      );
    }

    // Validate transcription quality
    if (!transcription || transcription.trim().length < 10) {
      throw new Error(
        `Transcription too short or empty (${
          transcription?.length || 0
        } characters). This may indicate poor audio quality or transcription failure.`
      );
    }

    // Store transcription in database
    await pool.query(`UPDATE files SET transcription = $1 WHERE id = $2`, [
      transcription,
      fileId,
    ]);

    console.log(`✅ Transcription stored: ${transcription.length} characters`);

    // Generate notes based on user type and custom prompt
    let notes;

    // DEBUG: Add detailed logging
    console.log(`🔍 DEBUG: userId = ${userId}`);
    console.log(`🔍 DEBUG: customPrompt = ${JSON.stringify(customPrompt)}`);
    console.log(
      `🔍 DEBUG: customPrompt.systemPrompt = ${customPrompt?.systemPrompt}`
    );
    console.log(
      `🔍 DEBUG: Condition check: userId && customPrompt && customPrompt.systemPrompt = ${!!(
        userId &&
        customPrompt &&
        customPrompt.systemPrompt
      )}`
    );

    if (userId && customPrompt && customPrompt.systemPrompt) {
      // Registered user with custom prompt
      console.log(`👤 Using custom prompt for registered user`);
      console.log(
        `🔍 Custom prompt: ${customPrompt.systemPrompt.substring(0, 200)}...`
      );
      try {
        const noteResult = await openaiService.generateNotes(
          transcription,
          customPrompt,
          {
            userId: userId,
            procedureType: "general",
          }
        );

        // Handle both old string format and new object format
        if (typeof noteResult === "string") {
          notes = {
            soapNote: noteResult,
            patientSummary: noteResult, // Fallback for backward compatibility
          };
        } else {
          notes = {
            soapNote: noteResult.soapNote,
            patientSummary: noteResult.patientSummary,
          };
        }
      } catch (noteError) {
        console.error(`❌ Note generation failed:`, noteError);
        throw new Error(
          `Failed to generate notes: ${noteError.message}. Please try again or contact support.`
        );
      }
    } else {
      // Unregistered user or default prompt
      console.log(`👤 Using default prompt`);
      console.log(`🔍 DEBUG: Reason for using default prompt:`);
      console.log(`🔍 DEBUG: - userId exists: ${!!userId}`);
      console.log(`🔍 DEBUG: - customPrompt exists: ${!!customPrompt}`);
      console.log(
        `🔍 DEBUG: - customPrompt.systemPrompt exists: ${!!customPrompt?.systemPrompt}`
      );

      const defaultPrompt = {
        systemPrompt: openaiService.getDefaultSystemPrompt(),
        userPrompt: openaiService.getDefaultUserPrompt(transcription, {
          procedureType: "general",
        }),
      };

      try {
        const noteResult = await openaiService.generateNotes(
          transcription,
          defaultPrompt,
          {
            procedureType: "general",
          }
        );

        // Handle both old string format and new object format
        if (typeof noteResult === "string") {
          notes = {
            soapNote: noteResult,
            patientSummary: noteResult, // Fallback for backward compatibility
          };
        } else {
          notes = {
            soapNote: noteResult.soapNote,
            patientSummary: noteResult.patientSummary,
          };
        }
      } catch (noteError) {
        console.error(`❌ Default note generation failed:`, noteError);
        throw new Error(
          `Failed to generate notes with default prompt: ${noteError.message}. Please try again or contact support.`
        );
      }
    }

    // Save notes to database - save separate notes for SOAP and patient summary
    let soapNoteId = null;
    let patientSummaryId = null;

    // ✅ NEW: Create conversation for note generation and save AI responses
    let conversationId = null;
    let noteGenerationMessages = [];

    if (notes.soapNote) {
      const soapResult = await pool.query(
        `INSERT INTO notes (file_id, note_type, content, user_id, prompt_used, ai_model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
        [
          fileId,
          "soap_note",
          notes.soapNote,
          userId,
          customPrompt ? JSON.stringify(customPrompt) : null,
          process.env.OPENAI_MODEL || "gpt-4o",
        ]
      );
      soapNoteId = soapResult.rows[0].id;

      // ✅ NEW: Create conversation for this note generation
      if (userId) {
        const convResult = await pool.query(
          `INSERT INTO chat_conversations (user_id, note_id, title, clinical_context, transcription, file_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            userId,
            soapNoteId,
            `Note Generation - ${fileInfo.originalName}`,
            JSON.stringify({
              transcription: transcription,
              notes: notes,
              fileName: fileInfo.originalName,
              noteType: "soap_note",
              fileId: fileId,
              status: "completed",
            }),
            transcription,
            fileId,
          ]
        );
        conversationId = convResult.rows[0].id;

        // ✅ NEW: Save the note generation as AI message
        const aiMessageResult = await pool.query(
          `INSERT INTO chat_messages (conversation_id, sender_type, message_text, ai_response)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            conversationId,
            "ai",
            "",
            `Generated SOAP Note:\n\n${notes.soapNote}`,
          ]
        );
        noteGenerationMessages.push(aiMessageResult.rows[0].id);

        console.log(
          `✅ Created conversation ${conversationId} for note generation`
        );
        console.log(`✅ Saved SOAP note generation as AI message`);
      }
    }

    if (notes.patientSummary) {
      const summaryResult = await pool.query(
        `INSERT INTO notes (file_id, note_type, content, user_id, prompt_used, ai_model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
        [
          fileId,
          "patient_summary",
          notes.patientSummary,
          userId,
          customPrompt ? JSON.stringify(customPrompt) : null,
          process.env.OPENAI_MODEL || "gpt-4o",
        ]
      );
      patientSummaryId = summaryResult.rows[0].id;

      // ✅ NEW: If we already have a conversation, add patient summary to it
      if (conversationId && userId) {
        const aiMessageResult = await pool.query(
          `INSERT INTO chat_messages (conversation_id, sender_type, message_text, ai_response)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            conversationId,
            "ai",
            "",
            `Generated Patient Summary:\n\n${notes.patientSummary}`,
          ]
        );
        noteGenerationMessages.push(aiMessageResult.rows[0].id);

        console.log(
          `✅ Added patient summary to conversation ${conversationId}`
        );
      }
    }

    // Also create "Saved Notes" entries for the generated notes
    if (userId && notes.soapNote) {
      console.log(
        `🔐 Creating saved SOAP note for user ${userId}, file ${fileId}`
      );
      const encrypted = encryptionUtils.encryptData(notes.soapNote, userId);
      const contentHash = encryptionUtils.hashData(notes.soapNote);

      const savedNoteResult = await pool.query(
        `INSERT INTO encrypted_saved_notes 
         (user_id, note_type, note_name, encrypted_content, encryption_iv, 
          content_hash, file_id, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          "soap_note",
          `SOAP Note - ${fileInfo.originalName}`,
          encrypted.encryptedData,
          encrypted.iv,
          contentHash,
          fileId,
          null,
        ]
      );
      console.log(
        `✅ Saved SOAP note created with ID: ${savedNoteResult.rows[0].id}`
      );
    }

    if (userId && notes.patientSummary) {
      console.log(
        `🔐 Creating saved Patient Summary for user ${userId}, file ${fileId}`
      );
      const encrypted = encryptionUtils.encryptData(
        notes.patientSummary,
        userId
      );
      const contentHash = encryptionUtils.hashData(notes.patientSummary);

      const savedSummaryResult = await pool.query(
        `INSERT INTO encrypted_saved_notes 
         (user_id, note_type, note_name, encrypted_content, encryption_iv, 
          content_hash, file_id, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          "patient_summary",
          `Patient Summary - ${fileInfo.originalName}`,
          encrypted.encryptedData,
          encrypted.iv,
          contentHash,
          fileId,
          null,
        ]
      );
      console.log(
        `✅ Saved Patient Summary created with ID: ${savedSummaryResult.rows[0].id}`
      );
    }

    console.log(`✅ Notes generated and saved successfully`);

    return {
      success: true,
      notes: notes,
      transcription: transcription,
      conversationId: conversationId, // ✅ NEW: Include conversation ID
    };
  } catch (error) {
    console.error("❌ OpenAI processing error:", error);

    // Update file status to reflect error
    try {
      await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
        fileId,
      ]);
    } catch (dbError) {
      console.error("❌ Failed to update file status:", dbError);
    }

    throw error;
  }
};

// Helper function to get custom prompt
const getCustomPrompt = async (promptId) => {
  try {
    const result = await pool.query(
      "SELECT * FROM custom_prompts WHERE id = $1",
      [promptId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error getting custom prompt:", error);
    return null;
  }
};

// File upload endpoint - allows both authenticated and anonymous uploads
router.post("/", optionalAuth, upload.single("file"), async (req, res) => {
  let tempFilePath = null;

  try {
    console.log(`🚀 Upload request received: ${req.method} ${req.path}`);
    console.log(`📁 Request headers:`, req.headers);
    console.log(`📁 Request body keys:`, Object.keys(req.body || {}));
    console.log(
      `📁 File object:`,
      req.file
        ? {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
          }
        : "No file"
    );

    if (!req.file) {
      console.log(`❌ No file in request`);
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { file } = req;
    tempFilePath = file.path;

    console.log(`✅ File received: ${file.originalname} (${file.size} bytes)`);

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
    console.log(`🔄 Moving file from temp to uploads...`);
    const uploadPath = await moveToUploads(tempFilePath, fileInfo.filename);
    tempFilePath = null; // Clear temp path since file was moved

    // Add file path to fileInfo for OpenAI processing
    fileInfo.filePath = uploadPath;

    console.log(`🔍 Debug: uploadPath = ${uploadPath}`);
    console.log(`🔍 Debug: fileInfo.filePath = ${fileInfo.filePath}`);

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

    // Process file with OpenAI
    try {
      console.log(`🔍 DEBUG: req.body.customPrompt = ${req.body.customPrompt}`);
      console.log(
        `🔍 DEBUG: req.body.customPrompt type = ${typeof req.body.customPrompt}`
      );
      console.log(
        `🔍 DEBUG: req.body.customPrompt length = ${req.body.customPrompt?.length}`
      );

      const customPrompt = req.body.customPrompt
        ? { systemPrompt: req.body.customPrompt, userPrompt: null }
        : null;

      console.log(
        `🔍 DEBUG: customPrompt object created = ${JSON.stringify(
          customPrompt
        )}`
      );

      // Validate custom prompt length
      if (customPrompt && customPrompt.systemPrompt.length > 10000) {
        return res.status(400).json({
          error: "Custom prompt too long",
          message: "Custom prompt must be less than 10,000 characters",
        });
      }

      console.log(`🔍 Custom prompt received:`, customPrompt ? "Yes" : "No");
      if (customPrompt) {
        console.log(
          `🔍 Custom prompt length: ${customPrompt.systemPrompt.length} characters`
        );
        console.log(
          `🔍 Custom prompt preview: ${customPrompt.systemPrompt.substring(
            0,
            100
          )}...`
        );
      }

      console.log(
        `🔍 Before function call - fileInfo:`,
        JSON.stringify(fileInfo, null, 2)
      );
      console.log(
        `🔍 Before function call - fileInfo.filePath: ${fileInfo.filePath}`
      );

      console.log(`🤖 Starting OpenAI processing...`);
      const processingResult = await processFileWithOpenAI(
        fileInfo,
        fileId,
        userId,
        customPrompt
      );

      console.log(`✅ OpenAI processing completed successfully`);

      // Update file and task status
      await pool.query(`UPDATE files SET status = 'processed' WHERE id = $1`, [
        fileId,
      ]);

      await pool.query(
        `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
        [fileId]
      );

      console.log(`✅ Database updated successfully`);

      return res.json({
        success: true,
        file: { id: fileId, status: "processed" },
        notes: processingResult.notes,
        transcription: processingResult.transcription,
      });
    } catch (processingError) {
      console.error("❌ OpenAI processing error:", processingError);

      // Update task status to reflect the error
      await pool.query(
        `UPDATE tasks SET status = 'failed', error_message = $1 WHERE file_id = $2`,
        [processingError.message, fileId]
      );

      // Update file status to reflect error state
      await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
        fileId,
      ]);

      return res.json({
        success: true,
        file: { id: fileId, status: "failed" },
        message:
          "File uploaded but failed to process with AI. Please try again.",
        taskStatus: "failed",
        error: processingError.message,
      });
    }
  } catch (error) {
    console.error("❌ Upload error:", error);

    // Clean up temp file if it exists
    if (tempFilePath) {
      try {
        // Use fs.access to check if file exists (fs.promises compatible)
        await fsPromises.access(tempFilePath);
        await fsPromises.unlink(tempFilePath);
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

    // Handle specific error types
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
      return res.status(408).json({
        error: "Upload timeout",
        message:
          "The upload connection was reset. Please try again with a smaller file or check your internet connection.",
      });
    }

    if (error.message && error.message.includes("File too large")) {
      return res.status(413).json({
        error: "File too large",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "Upload failed",
      message: error.message || "An error occurred during file upload",
    });
  }
});

// Chunk upload endpoint for large files
router.post(
  "/chunk",
  optionalAuth,
  uploadChunk.single("chunk"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No chunk uploaded" });
      }

      const { chunkIndex, totalChunks, fileId, filename } = req.body;

      if (!chunkIndex || !totalChunks || !filename) {
        return res.status(400).json({ error: "Missing chunk information" });
      }

      // Validate chunk index
      const chunkIndexNum = parseInt(chunkIndex);
      const totalChunksNum = parseInt(totalChunks);

      if (chunkIndexNum < 0 || chunkIndexNum >= totalChunksNum) {
        return res.status(400).json({
          error: "Invalid chunk index",
          message: `Chunk index ${chunkIndexNum} is out of range (0-${
            totalChunksNum - 1
          })`,
        });
      }

      // Create temp directory for this file
      const tempFileDir = path.join(
        process.env.TEMP_PATH || "./temp",
        `chunked_${fileId || Date.now()}`
      );
      await fsPromises.mkdir(tempFileDir, { recursive: true });

      // Check if chunk already exists (prevent duplicates)
      const chunkPath = path.join(tempFileDir, `chunk_${chunkIndexNum}`);
      try {
        await fsPromises.access(chunkPath);
        console.warn(
          `⚠️ Chunk ${chunkIndexNum} already exists, overwriting...`
        );
      } catch (error) {
        // Chunk doesn't exist, which is fine
      }

      // Save chunk
      await fsPromises.copyFile(req.file.path, chunkPath);
      await fsPromises.unlink(req.file.path);

      // Verify chunk was saved correctly
      const savedChunkStats = await fsPromises.stat(chunkPath);
      console.log(
        `📁 Chunk ${chunkIndexNum}/${totalChunksNum} saved for ${filename}: ${savedChunkStats.size} bytes`
      );

      res.json({
        success: true,
        chunkIndex: chunkIndexNum,
        message: `Chunk ${chunkIndexNum} uploaded successfully`,
      });
    } catch (error) {
      console.error("Chunk upload error:", error);
      res.status(500).json({
        error: "Chunk upload failed",
        message: error.message,
      });
    }
  }
);

// Finalize chunked upload
router.post("/finalize", optionalAuth, async (req, res) => {
  try {
    const { fileId, filename, fileType, fileSize, totalChunks, customPrompt } =
      req.body;

    if (!fileId || !filename || !fileType || !fileSize || !totalChunks) {
      return res.status(400).json({ error: "Missing file information" });
    }

    // Validate chunk count
    if (totalChunks <= 0 || totalChunks > 1000) {
      return res.status(400).json({
        error: "Invalid chunk count",
        message: "Chunk count must be between 1 and 1000",
      });
    }

    const tempFileDir = path.join(
      process.env.TEMP_PATH || "./temp",
      `chunked_${fileId}`
    );
    const finalFilePath = path.join(
      process.env.UPLOAD_PATH || "./uploads",
      filename
    );

    // Check if all chunks exist and validate their sizes
    let totalChunkSize = 0;
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempFileDir, `chunk_${i}`);
      try {
        const chunkStats = await fsPromises.stat(chunkPath);
        totalChunkSize += chunkStats.size;

        // Validate chunk size (should be reasonable)
        if (chunkStats.size === 0) {
          return res.status(400).json({
            error: "Invalid chunk",
            message: `Chunk ${i} is empty (0 bytes)`,
          });
        }
      } catch (error) {
        return res.status(400).json({
          error: "Missing chunks",
          message: `Chunk ${i} is missing. Please re-upload all chunks.`,
        });
      }
    }

    // Validate total size matches expected
    const expectedSize = parseInt(fileSize);
    if (Math.abs(totalChunkSize - expectedSize) > 1024) {
      // Allow 1KB difference
      console.warn(
        `Size mismatch: expected ${expectedSize}, got ${totalChunkSize}`
      );
    }

    console.log(
      `🔍 Combining ${totalChunks} chunks into final file: ${filename}`
    );
    console.log(
      `📏 Total chunk size: ${totalChunkSize} bytes, Expected: ${expectedSize} bytes`
    );

    // ✅ SIMPLIFIED: Reliable chunk merging without complex Promise chains
    const writeStream = fsSync.createWriteStream(finalFilePath);
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");

    console.log(`🚀 Starting chunk merge process...`);

    // Process chunks sequentially with simple approach
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempFileDir, `chunk_${i}`);

      try {
        console.log(
          `🔄 Processing chunk ${i + 1}/${totalChunks}: ${chunkPath}`
        );

        // Validate chunk exists and has content
        const chunkStats = await fsPromises.stat(chunkPath);
        if (chunkStats.size === 0) {
          throw new Error(`Chunk ${i} is empty (0 bytes)`);
        }

        console.log(`📁 Chunk ${i} size: ${chunkStats.size} bytes`);

        // ✅ SIMPLIFIED: Direct file append without complex streaming
        const chunkData = await fsPromises.readFile(chunkPath);
        hash.update(chunkData);
        writeStream.write(chunkData);

        console.log(`✅ Processed chunk ${i}: ${chunkStats.size} bytes`);
      } catch (chunkError) {
        console.error(`❌ Error processing chunk ${i}:`, chunkError);
        writeStream.destroy();

        // Clean up partial file
        try {
          await fsPromises.unlink(finalFilePath);
        } catch (cleanupError) {
          console.warn(
            `Warning: Could not cleanup partial file:`,
            cleanupError.message
          );
        }

        return res.status(500).json({
          error: "Chunk processing failed",
          message: `Failed to process chunk ${i}: ${chunkError.message}`,
          chunkIndex: i,
        });
      }
    }

    // Close the write stream
    writeStream.end();
    console.log(`🔚 Write stream closed, waiting for completion...`);

    // ✅ SIMPLIFIED: Wait for write stream to finish
    try {
      await new Promise((resolve, reject) => {
        writeStream.on("finish", () => {
          console.log(`✅ Write stream finished successfully`);
          resolve();
        });

        writeStream.on("error", (error) => {
          console.error(`❌ Write stream error:`, error);
          reject(error);
        });
      });
    } catch (writeError) {
      console.error(`❌ Write stream failed:`, writeError);

      // Clean up partial file
      try {
        await fsPromises.unlink(finalFilePath);
      } catch (cleanupError) {
        console.warn(
          `Warning: Could not cleanup partial file:`,
          cleanupError.message
        );
      }

      return res.status(500).json({
        error: "File creation failed",
        message: `Failed to create final file: ${writeError.message}`,
      });
    }

    // ✅ IMPROVED: Comprehensive file validation
    const finalStats = await fsPromises.stat(finalFilePath);
    console.log(`✅ Final file created: ${finalStats.size} bytes`);

    if (finalStats.size === 0) {
      return res.status(500).json({
        error: "File creation failed",
        message: "Final file is empty (0 bytes)",
      });
    }

    // Validate final file size with strict tolerance
    const sizeDifference = Math.abs(finalStats.size - expectedSize);
    if (sizeDifference > 1024) {
      // 1KB tolerance
      console.error(
        `❌ CRITICAL: File size mismatch - expected: ${expectedSize}, got: ${finalStats.size}, difference: ${sizeDifference} bytes`
      );

      // Clean up corrupted file
      try {
        await fsPromises.unlink(finalFilePath);
      } catch (cleanupError) {
        console.warn(
          `Warning: Could not cleanup corrupted file:`,
          cleanupError.message
        );
      }

      return res.status(500).json({
        error: "File corruption detected",
        message: `File size mismatch indicates corruption. Expected: ${expectedSize} bytes, got: ${finalStats.size} bytes. Please re-upload.`,
      });
    }

    // ✅ IMPROVED: File integrity verification using checksum
    const finalFileHash = hash.digest("hex");
    console.log(`🔒 File integrity hash: ${finalFileHash}`);

    // ✅ IMPROVED: Binary file validation (for audio files)
    const isAudioFile = fileType.startsWith("audio/");
    if (isAudioFile) {
      // For audio files, check file header and basic structure
      try {
        const headerBuffer = await fsPromises.readFile(finalFilePath, {
          encoding: null,
          flag: "r",
        });

        // Validate audio file headers
        const isValidAudioHeader = validateAudioFileHeader(
          headerBuffer,
          fileType
        );
        if (!isValidAudioHeader) {
          console.error(`❌ CRITICAL: Invalid audio file header detected`);

          // Clean up corrupted file
          try {
            await fsPromises.unlink(finalFilePath);
          } catch (cleanupError) {
            console.warn(
              `Warning: Could not cleanup corrupted audio file:`,
              cleanupError.message
            );
          }

          return res.status(500).json({
            error: "Audio file corruption detected",
            message:
              "Invalid audio file header indicates corruption. Please re-upload.",
          });
        }

        console.log(`✅ Audio file header validation passed`);
      } catch (headerError) {
        console.error(`❌ Error validating audio file header:`, headerError);
        return res.status(500).json({
          error: "Audio file validation failed",
          message: "Could not validate audio file integrity. Please re-upload.",
        });
      }
    } else {
      // For text files, perform text-based validation
      try {
        const sampleData = await fsPromises.readFile(finalFilePath, {
          encoding: "utf8",
          flag: "r",
        });

        const sampleLength = Math.min(sampleData.length, 1000);
        const sample = sampleData.substring(0, sampleLength);

        // Check for obvious corruption patterns
        if (
          sample.includes("undefined") ||
          sample.includes("null") ||
          sample.includes("[object Object]")
        ) {
          console.warn(
            `⚠️ Potential text corruption detected in final file sample`
          );
        }

        // ✅ NEW: Check for "English English English" repetition in text files
        const englishRepetitionPattern = /(english\s+){3,}/i;
        if (englishRepetitionPattern.test(sampleData)) {
          console.error(
            `🚨 CRITICAL: Text file contains "English English English" repetition pattern - indicates corruption`
          );

          // Clean up corrupted file
          try {
            await fsPromises.unlink(finalFilePath);
          } catch (cleanupError) {
            console.warn(
              `Warning: Could not cleanup corrupted text file:`,
              cleanupError.message
            );
          }

          return res.status(500).json({
            error: "Text file corruption detected",
            message:
              "Text file contains corruption patterns. Please re-upload with a valid file.",
          });
        }

        console.log(
          `🔍 Text file sample (first ${sampleLength} chars):`,
          sample.substring(0, 200) + "..."
        );
      } catch (textError) {
        console.warn(
          `⚠️ Could not read text file sample for validation:`,
          textError.message
        );
      }
    }

    // Log comprehensive chunk processing information
    console.log(`📊 Final file statistics:`, {
      expectedSize,
      actualSize: finalStats.size,
      sizeDifference: Math.abs(finalStats.size - expectedSize),
      totalChunks,
      processedChunks: totalChunks,
      integrityHash: finalFileHash,
    });

    // ✅ IMPROVED: Cleanup temporary chunks and directory
    console.log(`🧹 Cleaning up temporary chunks...`);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempFileDir, `chunk_${i}`);
      try {
        await fsPromises.unlink(chunkPath);
        console.log(`✅ Cleaned up chunk ${i}`);
      } catch (error) {
        console.warn(`⚠️ Warning: Could not delete chunk ${i}:`, error.message);
      }
    }

    // Remove temp directory
    try {
      await fsPromises.rmdir(tempFileDir);
      console.log(`✅ Cleaned up temp directory: ${tempFileDir}`);
    } catch (error) {
      console.warn(
        `⚠️ Warning: Could not remove temp directory:`,
        error.message
      );
    }

    // Get file stats and process with OpenAI
    const stats = await fsPromises.stat(finalFilePath);

    const fileInfo = {
      filename: filename,
      originalName: filename,
      fileSize: stats.size,
      fileType: fileType,
      filePath: finalFilePath,
      userId: req.user ? req.user.id : null,
    };

    // Save file info to database
    let fileResult;
    try {
      fileResult = await pool.query(
        `INSERT INTO files (filename, original_name, file_path, file_size, file_type, user_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
       RETURNING id`,
        [
          fileInfo.filename,
          fileInfo.originalName,
          finalFilePath,
          fileInfo.fileSize,
          fileType,
          fileInfo.userId,
        ]
      );
    } catch (dbError) {
      console.error("Database error saving file:", dbError);
      throw new Error(`Failed to save file to database: ${dbError.message}`);
    }

    const finalFileId = fileResult.rows[0].id;

    // Create task in database
    try {
      await pool.query(
        `INSERT INTO tasks (file_id, user_id, task_type, status, priority)
       VALUES ($1, $2, 'file_processing', 'pending', 1)`,
        [finalFileId, fileInfo.userId]
      );
    } catch (dbError) {
      console.error("Database error creating task:", dbError);
      throw new Error(`Failed to create task: ${dbError.message}`);
    }

    // Process file with OpenAI
    try {
      console.log(`🤖 Starting OpenAI processing for file: ${filename}`);
      console.log(`🔍 File path: ${finalFilePath}`);
      console.log(`🔍 File size: ${fileInfo.fileSize} bytes`);
      console.log(`🔍 File type: ${fileType}`);

      // Check if file exists and is accessible
      try {
        const fileExists = await fsPromises.access(finalFilePath);
        console.log(`✅ File exists and is accessible`);
      } catch (accessError) {
        console.error(`❌ File access error:`, accessError);
        throw new Error(
          `File not accessible after merge: ${accessError.message}`
        );
      }

      const customPromptObj = customPrompt
        ? { systemPrompt: customPrompt, userPrompt: null }
        : null;

      // Validate custom prompt length
      if (customPromptObj && customPromptObj.systemPrompt.length > 10000) {
        return res.status(400).json({
          error: "Custom prompt too long",
          message: "Custom prompt must be less than 10,000 characters",
        });
      }

      console.log(`🔍 Custom prompt received:`, customPromptObj ? "Yes" : "No");
      if (customPromptObj) {
        console.log(
          `🔍 Custom prompt length: ${customPromptObj.systemPrompt.length} characters`
        );
        console.log(
          `🔍 Custom prompt preview: ${customPromptObj.systemPrompt.substring(
            0,
            100
          )}...`
        );
      }

      console.log(`🚀 Calling processFileWithOpenAI...`);

      const processingResult = await processFileWithOpenAI(
        fileInfo,
        finalFileId,
        fileInfo.userId,
        customPromptObj
      );

      console.log(`✅ OpenAI processing completed successfully`);

      // Update file and task status
      await pool.query(`UPDATE files SET status = 'processed' WHERE id = $1`, [
        finalFileId,
      ]);
      await pool.query(
        `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
        [finalFileId]
      );

      console.log(`✅ Database updated successfully`);

      return res.json({
        success: true,
        file: { id: finalFileId, status: "processed" },
        notes: processingResult.notes,
        transcription: processingResult.transcription,
        conversationId: conversationId, // ✅ NEW: Include conversation ID
        message: "Large file uploaded and processed successfully",
      });
    } catch (processingError) {
      console.error("❌ OpenAI processing error:", processingError);

      // Update task status to reflect the error
      await pool.query(
        `UPDATE tasks SET status = 'failed', error_message = $1 WHERE file_id = $2`,
        [processingError.message, finalFileId]
      );

      // Update file status to reflect error state
      await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
        finalFileId,
      ]);

      return res.json({
        success: true,
        file: { id: finalFileId, status: "failed" },
        message:
          "File uploaded but failed to process with AI. Please try again.",
        taskStatus: "failed",
        error: processingError.message,
      });
    }
  } catch (error) {
    console.error("Finalize chunked upload error:", error);
    res.status(500).json({
      error: "Finalization failed",
      message: error.message || "An error occurred during file finalization",
    });
  }
});

module.exports = router;
