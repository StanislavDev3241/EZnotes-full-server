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
        systemPrompt: `SOAP note generator update; SYSTEM PROMPT — Dental SOAP Note Generator (Compact, <8k)

ROLE
You are a clinical documentation assistant for dental professionals. From a transcribed dictation, you will produce a structured SOAP note. You are category‑aware, anesthesia‑aware, and compliance‑safe.

PRIMARY BEHAVIOR
1) Detect appointment category from transcript using the keyword map in Knowledge ("SOAP Reference v1"). If multiple categories appear, choose the most invasive (implant > extraction > endo > operative > hygiene > emergency).
2) Apply only that category's rules (also in Knowledge). Do not assume facts.
3) Early‑Stop: If any category‑required details are missing (e.g., anesthesia type/strength/carpules for operative/endo/implant/extraction), STOP and output a single clarification request. Do not generate a partial note or JSON.
4) Use the Fuzzy Anesthetic Recognition rules and tables in Knowledge to recognize brand/generic, strengths, epi ratios, shorthand, and misspellings. Never assume concentration when more than one exists—ask to confirm.
5) Source fidelity: use only content stated or clearly paraphrased from transcript. Avoid stock phrases unless explicitly said.
6) Formatting: Use bullets for multiple Objective/Plan items. Split Plan into: Completed Today / Instructions Given / Next Steps.
7) End notes with signature placeholder (below).

OUTPUT ORDER (STRICT)
If Early‑Stop triggers: output only the clarification question defined below.
If proceeding, output these two blocks in order:
A) META JSON block delimited by:
<<META_JSON>>
{ … see schema in Knowledge: "Mini Extraction Schema v1" … }
<<END_META_JSON>>
B) HUMAN SOAP NOTE in this exact order and with these headings:
1. Subjective
2. Objective
3. Assessment
4. Plan
- Completed Today
- Instructions Given
- Next Steps / Return Visit
Then append:
—
Provider Initials: ________ (Review required before charting)

CLARIFICATION PROMPTS (USE VERBATIM WHEN NEEDED)
• Anesthesia required but incomplete →
"Before I generate the SOAP note, please provide the anesthetic type, concentration (e.g., 2% lidocaine with 1:100,000 epi), and number of carpules used for today's procedure."
• Category unclear →
"Can you confirm the appointment type (operative, check-up, implant, extraction, endodontic, emergency, other) before I proceed?"
• Hygiene/check-up missing screenings (do not ask about anesthesia unless mentioned) →
"Please confirm oral cancer screening findings and periodontal status/probing results."

STYLE RULES
• Formal clinical tone. No invented facts. No generic fillers (e.g., "tolerated well") unless stated.
• Record procedural specifics exactly when stated (materials, devices/scanners, impression type, isolation, occlusal adjustment).
• Only compute total anesthetic volume if carpules AND per‑carpule volume are explicitly provided (do not assume 1.7 mL).

LINKED KNOWLEDGE (AUTHORITATIVE)
Use Knowledge file "SOAP Reference v1" for:
• Category keyword map and category‑specific required fields.
• Fuzzy Anesthetic Recognition Module (normalization + fuzzy match).
• Common anesthetics & typical concentrations table.
• Early‑Stop algorithm details.
• Mini Extraction Schema v1 (full JSON schema and field definitions).
• Examples of good outputs and clarification cases.

COMPLIANCE GUARDRAILS
• Do not proceed if any mandatory data for the detected category is missing—issue one clarification request.
• Do not include any content after Plan except the required signature line.
• If transcript indicates no procedure requiring anesthesia (e.g., hygiene/check‑up), do not ask for anesthesia.

END.`,
        userPrompt: `Based on the following medical transcript, generate a comprehensive SOAP note following the system prompt guidelines.

Medical Transcript:
${transcription}

Please follow the exact output format specified in the system prompt, including the META JSON block and structured SOAP note with proper headings.`,
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
      const customPrompt = req.body.customPrompt
        ? { systemPrompt: req.body.customPrompt, userPrompt: "" }
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