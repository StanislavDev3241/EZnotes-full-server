const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openaiService");
const jwt = require("jsonwebtoken");
const encryptionUtils = require("../../encryption-utils");
const auditService = require("../services/auditService");

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // Get user from database to ensure they still exist and are active
    const userResult = await pool.query(
      "SELECT id, email, role, is_active FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Add user info to request
    req.user = {
      userId: userResult.rows[0].id,
      email: userResult.rows[0].email,
      role: userResult.rows[0].role,
    };

    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Get all notes for a user
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can only access their own notes (unless admin)
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const notes = await pool.query(
      `SELECT 
        n.id, n.file_id, n.user_id, n.note_type, n.content, n.status,
        n.version, n.parent_note_id, n.prompt_used, n.ai_model,
        n.created_at, n.updated_at,
        f.original_name as filename,
        f.transcription
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC`,
      [userId]
    );

    // Log data access
    await auditService.logDataAccess(req.user.userId, "notes", null, "api");

    res.json({
      success: true,
      notes: notes.rows,
      count: notes.rows.length,
    });
  } catch (error) {
    console.error("Get user notes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user notes",
      error: error.message,
    });
  }
});

// Get a specific note by ID
router.get("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await pool.query(
      `SELECT 
        n.*,
        f.original_name as filename,
        f.transcription
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.id = $1`,
      [noteId]
    );

    if (note.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can access this note
    if (req.user.role !== "admin" && req.user.userId !== note.rows[0].user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Log data access
    await auditService.logDataAccess(req.user.userId, "notes", noteId, "api");

    res.json({
      success: true,
      note: note.rows[0],
    });
  } catch (error) {
    console.error("Get note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get note",
      error: error.message,
    });
  }
});

// Update a note
router.put("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content, status, note_type } = req.body;

    // Get current note to check permissions and for audit
    const currentNote = await pool.query("SELECT * FROM notes WHERE id = $1", [
      noteId,
    ]);

    if (currentNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can modify this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updatedNote = await pool.query(
      `UPDATE notes
       SET content = COALESCE($1, content),
           status = COALESCE($2, status),
           note_type = COALESCE($3, note_type),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [content, status, note_type, noteId]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "notes",
      noteId,
      "update",
      currentNote.rows[0].content,
      content
    );

    res.json({
      success: true,
      note: updatedNote.rows[0],
      message: "Note updated successfully",
    });
  } catch (error) {
    console.error("Update note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update note",
      error: error.message,
    });
  }
});

// Delete a note
router.delete("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    // Get current note to check permissions
    const currentNote = await pool.query("SELECT * FROM notes WHERE id = $1", [
      noteId,
    ]);

    if (currentNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can delete this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== currentNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const deletedNote = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [noteId]
    );

    // Log data modification
    await auditService.logDataModify(
      req.user.userId,
      "notes",
      noteId,
      "delete",
      currentNote.rows[0].content,
      null
    );

    res.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Delete note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete note",
      error: error.message,
    });
  }
});

// Save encrypted note (create or update)
router.post("/save", authenticateToken, async (req, res) => {
  try {
    const { content, noteType, noteName, fileId, conversationId } = req.body;
    const userId = req.user.userId;

    if (!content || !noteType || !noteName) {
      return res.status(400).json({
        success: false,
        message: "Content, note type, and note name are required",
      });
    }

    // Check if table exists, if not create it
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS encrypted_saved_notes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          note_type VARCHAR(50) NOT NULL,
          note_name VARCHAR(200) NOT NULL,
          encrypted_content TEXT NOT NULL,
          encryption_iv VARCHAR(32) NOT NULL,
          encryption_algorithm VARCHAR(20) DEFAULT 'aes-256-cbc',
          content_hash VARCHAR(64) NOT NULL,
          file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
          conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (tableError) {
      console.error("Table creation error:", tableError);
    }

    // Check if note with same name already exists for this user
    const existingNote = await pool.query(
      `SELECT id FROM encrypted_saved_notes 
       WHERE user_id = $1 AND note_name = $2 AND note_type = $3`,
      [userId, noteName, noteType]
    );

    let result;
    if (existingNote.rows.length > 0) {
      // Update existing note
      const noteId = existingNote.rows[0].id;
      const encrypted = encryptionUtils.encryptData(content, userId);
      const contentHash = encryptionUtils.hashData(content);

      result = await pool.query(
        `UPDATE encrypted_saved_notes 
         SET encrypted_content = $1, encryption_iv = $2, content_hash = $3, 
             file_id = $4, conversation_id = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          encrypted.encryptedData,
          encrypted.iv,
          contentHash,
          fileId || null,
          conversationId || null,
          noteId,
        ]
      );

      // Log data modification
      await auditService.logDataModify(
        userId,
        "encrypted_saved_notes",
        noteId,
        "update",
        "Updated existing note",
        noteName
      );
    } else {
      // Create new note
      const encrypted = encryptionUtils.encryptData(content, userId);
      const contentHash = encryptionUtils.hashData(content);

      result = await pool.query(
        `INSERT INTO encrypted_saved_notes 
         (user_id, note_type, note_name, encrypted_content, encryption_iv, 
          content_hash, file_id, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          noteType,
          noteName,
          encrypted.encryptedData,
          encrypted.iv,
          contentHash,
          fileId || null,
          conversationId || null,
        ]
      );

      // Log data creation
      await auditService.logAction(
        userId,
        "save_note",
        "encrypted_saved_notes",
        result.rows[0].id,
        { noteType, noteName, contentLength: content.length }
      );
    }

    res.json({
      success: true,
      message:
        existingNote.rows.length > 0
          ? "Note updated successfully"
          : "Note saved successfully",
      note: {
        id: result.rows[0].id,
        noteName: result.rows[0].note_name,
        noteType: result.rows[0].note_type,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("Save note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save note",
      error: error.message,
    });
  }
});

// Get encrypted saved notes for a user
router.get("/saved/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔍 Loading saved notes for user: ${userId}`);

    // Verify user can access their saved notes
    if (req.user.role !== "admin" && req.user.userId !== parseInt(userId)) {
      console.log(
        `❌ Access denied: req.user.userId=${req.user.userId}, requested userId=${userId}`
      );
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const savedNotes = await pool.query(
      `SELECT 
        id, note_type, note_name, content_hash, file_id, conversation_id, created_at, updated_at
      FROM encrypted_saved_notes
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    console.log(
      `📊 Found ${savedNotes.rows.length} saved notes for user ${userId}`
    );
    console.log(`📋 Saved notes:`, savedNotes.rows);

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "encrypted_saved_notes",
      null,
      "api"
    );

    res.json({
      success: true,
      notes: savedNotes.rows,
      count: savedNotes.rows.length,
    });
  } catch (error) {
    console.error("Get saved notes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get saved notes",
      error: error.message,
    });
  }
});

// Get decrypted content of a saved note
router.get("/saved/content/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const savedNote = await pool.query(
      `SELECT * FROM encrypted_saved_notes WHERE id = $1`,
      [noteId]
    );

    if (savedNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Saved note not found",
      });
    }

    // Verify user can access this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== savedNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Decrypt the content with error handling
    let decryptedContent;
    try {
      decryptedContent = encryptionUtils.decryptData(
        savedNote.rows[0].encrypted_content,
        savedNote.rows[0].encryption_iv,
        savedNote.rows[0].user_id
      );
    } catch (decryptError) {
      console.error(
        "Decryption failed for note",
        noteId,
        ":",
        decryptError.message
      );

      // Try to get the content from the regular notes table as a fallback
      try {
        // First try to find notes with the same file_id and user_id, regardless of note_type
        const fallbackNote = await pool.query(
          `SELECT content, note_type FROM notes WHERE file_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [savedNote.rows[0].file_id, savedNote.rows[0].user_id]
        );

        if (fallbackNote.rows.length > 0) {
          decryptedContent = fallbackNote.rows[0].content;
          console.log(
            `Retrieved content from fallback notes table for note ${noteId}, note_type: ${fallbackNote.rows[0].note_type}`
          );
        } else {
          // If no notes found, try to get from files table transcription
          const fileNote = await pool.query(
            `SELECT transcription FROM files WHERE id = $1 AND user_id = $2`,
            [savedNote.rows[0].file_id, savedNote.rows[0].user_id]
          );

          if (fileNote.rows.length > 0 && fileNote.rows[0].transcription) {
            decryptedContent = fileNote.rows[0].transcription;
            console.log(
              `Retrieved transcription from files table for note ${noteId}`
            );
          } else {
            decryptedContent =
              "[Note content could not be decrypted. This may be due to encryption key changes.]";
          }
        }
      } catch (fallbackError) {
        console.error("Fallback retrieval also failed:", fallbackError.message);
        decryptedContent =
          "[Note content could not be decrypted. This may be due to encryption key changes.]";
      }
    }

    // Log data access
    await auditService.logDataAccess(
      req.user.userId,
      "encrypted_saved_notes",
      noteId,
      "api"
    );

    res.json({
      success: true,
      note: {
        id: savedNote.rows[0].id,
        noteType: savedNote.rows[0].note_type,
        content: decryptedContent,
        createdAt: savedNote.rows[0].created_at,
        updatedAt: savedNote.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("Get saved note content error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get note content",
      error: error.message,
    });
  }
});

// Get notes for a specific file (new endpoint)
router.get("/file/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    // Get notes for this file
    const notesResult = await pool.query(
      `SELECT 
        n.id, n.file_id, n.user_id, n.note_type, n.content, n.status,
        n.version, n.parent_note_id, n.prompt_used, n.ai_model,
        n.created_at, n.updated_at,
        f.original_name as filename,
        f.transcription
      FROM notes n
      LEFT JOIN files f ON n.file_id = f.id
      WHERE n.file_id = $1 AND n.user_id = $2
      ORDER BY n.created_at DESC`,
      [fileId, userId]
    );

    // Log data access
    await auditService.logDataAccess(userId, "notes", fileId, "api");

    res.json({
      success: true,
      notes: notesResult.rows,
      count: notesResult.rows.length,
    });
  } catch (error) {
    console.error("Get file notes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get file notes",
      error: error.message,
    });
  }
});

// Delete a saved note
router.delete("/saved/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.userId;

    // Check if the saved note exists
    const savedNote = await pool.query(
      `SELECT * FROM encrypted_saved_notes WHERE id = $1`,
      [noteId]
    );

    if (savedNote.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Saved note not found",
      });
    }

    // Verify user can delete this note
    if (
      req.user.role !== "admin" &&
      req.user.userId !== savedNote.rows[0].user_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Delete the saved note
    const deletedNote = await pool.query(
      "DELETE FROM encrypted_saved_notes WHERE id = $1 RETURNING *",
      [noteId]
    );

    // Log the deletion
    await auditService.logDataModify(
      req.user.userId,
      "encrypted_saved_notes",
      noteId,
      "delete",
      savedNote.rows[0].note_type,
      null
    );

    res.json({
      success: true,
      message: "Saved note deleted successfully",
    });
  } catch (error) {
    console.error("Delete saved note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete saved note",
      error: error.message,
    });
  }
});

// Delete a generated note
router.delete("/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.userId;

    // Check if the note exists
    const note = await pool.query(`SELECT * FROM notes WHERE id = $1`, [
      noteId,
    ]);

    if (note.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    // Verify user can delete this note
    if (req.user.role !== "admin" && req.user.userId !== note.rows[0].user_id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Delete the note
    const deletedNote = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [noteId]
    );

    // Log the deletion
    await auditService.logDataModify(
      req.user.userId,
      "notes",
      noteId,
      "delete",
      note.rows[0].note_type,
      null
    );

    res.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Delete note error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete note",
      error: error.message,
    });
  }
});

module.exports = router;
