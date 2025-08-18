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

const router = express.Router();

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
      transcription = await openaiService.transcribeAudio(fileInfo.filePath);
    } else if (fileInfo.fileType === "text/plain") {
      // Text file - read content directly
      console.log(`📄 Text file detected, reading content directly`);
      transcription = await fsPromises.readFile(fileInfo.filePath, "utf8");
    } else {
      throw new Error(`Unsupported file type: ${fileInfo.fileType}`);
    }

    // Store transcription in database
    await pool.query(`UPDATE files SET transcription = $1 WHERE id = $2`, [
      transcription,
      fileId,
    ]);

    console.log(`✅ Transcription stored: ${transcription.length} characters`);

    // Generate notes based on user type and custom prompt
    let notes;
    if (userId && customPrompt) {
      // Registered user with custom prompt
      console.log(`👤 Using custom prompt for registered user`);
      const noteContent = await openaiService.generateNotes(
        transcription,
        customPrompt,
        {
          userId: userId,
          procedureType: customPrompt.specialty || "general",
        }
      );

      notes = {
        soapNote: noteContent,
        patientSummary: noteContent, // You might want to generate separate patient summary
      };
    } else {
      // Unregistered user or default prompt
      console.log(`👤 Using default prompt`);
      const defaultPrompt = {
        systemPrompt:
          "You are a medical AI assistant. Generate a comprehensive SOAP note and patient summary.",
        userPrompt:
          "Generate a SOAP note and patient summary from this medical transcript.",
      };

      const noteContent = await openaiService.generateNotes(
        transcription,
        defaultPrompt,
        {
          procedureType: "general",
        }
      );

      notes = {
        soapNote: noteContent,
        patientSummary: noteContent,
      };
    }

    // Save notes to database
    const noteContent = JSON.stringify(notes);
    await pool.query(
      `INSERT INTO notes (file_id, note_type, content, user_id, prompt_used, ai_model, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        fileId,
        "ai_generated",
        noteContent,
        userId,
        customPrompt ? JSON.stringify(customPrompt) : "default",
        "gpt-4o",
      ]
    );

    console.log(`✅ Notes generated and saved successfully`);

    return {
      success: true,
      notes: notes,
      transcription: transcription,
    };
  } catch (error) {
    console.error("❌ OpenAI processing error:", error);
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
      const customPrompt = req.body.customPromptId
        ? await getCustomPrompt(req.body.customPromptId)
        : null;

      console.log(
        `🔍 Before function call - fileInfo:`,
        JSON.stringify(fileInfo, null, 2)
      );
      console.log(
        `🔍 Before function call - fileInfo.filePath: ${fileInfo.filePath}`
      );

      const processingResult = await processFileWithOpenAI(
        fileInfo,
        fileId,
        userId,
        customPrompt
      );

      // Update file and task status
      await pool.query(`UPDATE files SET status = 'processed' WHERE id = $1`, [
        fileId,
      ]);

      await pool.query(
        `UPDATE tasks SET status = 'completed' WHERE file_id = $1`,
        [fileId]
      );

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

    res.status(500).json({
      error: "Upload failed",
      message: error.message || "An error occurred during file upload",
    });
  }
});

module.exports = router;
