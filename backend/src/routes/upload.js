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
const openai = require("openai"); // Added for Whisper transcription

const router = express.Router();

// Enhanced file processing with OpenAI
const processFileWithOpenAI = async (fileInfo, userId = null) => {
  try {
    let transcription = "";
    let notes = {};

    // Get transcription based on file type
    if (fileInfo.fileType.startsWith("audio/")) {
      // Audio file - use Whisper for transcription
      const audioStream = fs.createReadStream(fileInfo.filePath);
      const whisperResponse = await openai.audio.transcriptions.create({
        file: audioStream,
        model: process.env.WHISPER_MODEL || "whisper-1",
      });
      transcription = whisperResponse.text;
    } else if (fileInfo.fileType === "text/plain") {
      // Text file - read content directly
      const fileContent = await fsPromises.readFile(fileInfo.filePath, "utf8");
      transcription = fileContent;
    }

    // Save file to database
    const fileResult = await pool.query(
      `INSERT INTO files (filename, original_name, file_path, file_size, file_type, user_id, transcription, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        fileInfo.filename,
        fileInfo.originalName,
        fileInfo.filePath,
        fileInfo.fileSize,
        fileInfo.fileType,
        userId,
        transcription,
        "processed",
      ]
    );

    const fileId = fileResult.rows[0].id;
    console.log(`✅ File saved to database with ID: ${fileId}`);

    // Generate notes using OpenAI
    const customPrompt = await getCustomPrompt(userId);
    const notesResponse = await openaiService.generateNotes(
      transcription,
      customPrompt
    );

    // Parse the notes response
    const soapNote =
      notesResponse.soapNote || notesResponse.content || notesResponse;
    const patientSummary = notesResponse.patientSummary || "";

    // Save notes to database
    const notesResult = await pool.query(
      `INSERT INTO notes (file_id, user_id, note_type, content, prompt_used, ai_model, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        fileId,
        userId,
        "soap_note",
        soapNote,
        customPrompt,
        process.env.OPENAI_MODEL || "gpt-4o",
        "generated",
      ]
    );

    const noteId = notesResult.rows[0].id;
    console.log(`✅ Notes saved to database with ID: ${noteId}`);

    // Create chat conversation for this note
    const conversationResult = await pool.query(
      `INSERT INTO chat_conversations (user_id, note_id, title)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, noteId, `Chat for ${fileInfo.originalName}`]
    );

    const conversationId = conversationResult.rows[0].id;
    console.log(`✅ Chat conversation created with ID: ${conversationId}`);

    // Save initial AI response to chat messages
    await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message_text, ai_response)
       VALUES ($1, $2, $3, $4)`,
      [conversationId, "ai", "Initial note generation", soapNote]
    );

    console.log(`✅ Initial chat message saved`);

    // Update file status
    await pool.query(`UPDATE files SET status = 'completed' WHERE id = $1`, [
      fileId,
    ]);

    return {
      fileId,
      noteId,
      conversationId,
      transcription,
      notes: {
        soapNote,
        patientSummary,
      },
      status: "completed",
    };
  } catch (error) {
    console.error("❌ Error processing file with OpenAI:", error);
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
      const processingResult = await processFileWithOpenAI(fileInfo, userId);

      // Return the complete result with database IDs
      res.json({
        success: true,
        message: "File processed successfully",
        data: {
          fileId: processingResult.fileId,
          noteId: processingResult.noteId,
          conversationId: processingResult.conversationId,
          fileName: fileInfo.originalName,
          transcription: processingResult.transcription,
          notes: processingResult.notes,
          status: processingResult.status,
        },
      });
    } catch (error) {
      console.error("❌ File processing error:", error);

      // Update file status to failed
      if (fileId) {
        await pool.query(`UPDATE files SET status = 'failed' WHERE id = $1`, [
          fileId,
        ]);
      }

      res.status(500).json({
        success: false,
        message: "Failed to process file",
        error: error.message,
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
