const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { pool } = require("../config/database");
const { noteGenerationQueue } = require("../config/queue");

const router = express.Router();

// CORS middleware for webhook endpoints
const webhookCors = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
};

// Test endpoint to verify webhook route is accessible
router.get("/test", webhookCors, (req, res) => {
  console.log("🧪 Webhook test endpoint accessed");
  res.json({
    message: "Webhook endpoint is accessible",
    timestamp: new Date().toISOString(),
    status: "working",
    webhookFormat: {
      method: "POST",
      url: "/api/notes/webhook",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        fileId: "number (required)",
        notes: "object with AI generated content (required for success)",
        noteType: "string: 'soap', 'summary', or 'both' (optional)",
        status: "string: 'success' or 'error' (required)",
        error: "string error message (required if status is 'error')",
      },
      example: {
        fileId: 14,
        notes: {
          soapNote: "AI generated SOAP note content...",
          patientSummary: "AI generated patient summary...",
        },
        noteType: "both",
        status: "success",
      },
    },
  });
});

// Webhook endpoint for Make.com to send generated notes
router.post("/webhook", webhookCors, async (req, res) => {
  try {
    console.log("🔔 Make.com webhook received:", {
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });

    const { fileId, notes, noteType, status, error } = req.body;

    if (!fileId) {
      console.error("❌ Webhook missing fileId:", req.body);
      return res.status(400).json({ error: "File ID is required" });
    }

    console.log(`📁 Processing webhook for file ${fileId}:`, {
      status,
      noteType,
      hasNotes: !!notes,
      notesKeys: notes ? Object.keys(notes) : null,
      error,
    });

    // Verify file exists
    const fileResult = await pool.query(
      `
      SELECT * FROM files WHERE id = $1
    `,
      [fileId]
    );

    if (fileResult.rows.length === 0) {
      console.error(`❌ File ${fileId} not found in database`);
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];
    console.log(`📋 File found:`, {
      id: file.id,
      filename: file.filename,
      userId: file.user_id,
      currentStatus: file.status,
    });

    if (status === "success" && notes) {
      console.log(`✅ Processing successful notes for file ${fileId}`);

      // Save generated notes
      const noteResult = await pool.query(
        `
        INSERT INTO notes (file_id, user_id, note_type, content, status)
        VALUES ($1, $2, $3, $4, 'generated')
        RETURNING id
      `,
        [fileId, file.user_id, noteType || "general", JSON.stringify(notes)]
      );

      console.log(`📝 Notes saved to database with ID:`, noteResult.rows[0].id);

      // Update file status
      const fileUpdateResult = await pool.query(
        `
        UPDATE files SET status = 'processed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING status
      `,
        [fileId]
      );

      console.log(
        `📁 File status updated to:`,
        fileUpdateResult.rows[0].status
      );

      // Update task status
      const taskUpdateResult = await pool.query(
        `
        UPDATE tasks SET status = 'completed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1 AND task_type = 'file_processing'
        RETURNING status
      `,
        [fileId]
      );

      console.log(
        `🔄 Task status updated to:`,
        taskUpdateResult.rows[0]?.status || "no task found"
      );

      console.log(`✅ Notes generated successfully for file: ${file.filename}`);

      // Add note generation job to queue for admin notification
      await noteGenerationQueue.add("notify-admin", {
        fileId,
        filename: file.filename,
        originalName: file.original_name,
        userId: file.user_id,
        noteType: noteType || "general",
        noteId: noteResult.rows[0].id,
      });

      console.log(`📬 Admin notification queued for file: ${file.filename}`);
    } else if (status === "error") {
      console.error(`❌ Processing error status for file ${fileId}:`, error);

      // Update file status
      const fileUpdateResult = await pool.query(
        `
        UPDATE files SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING status
      `,
        [fileId]
      );

      console.log(
        `📁 File status updated to:`,
        fileUpdateResult.rows[0].status
      );

      // Update task status
      const taskUpdateResult = await pool.query(
        `
        UPDATE tasks SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1 AND task_type = 'file_processing'
        RETURNING status
        `,
        [error || "Note generation failed"]
      );

      console.log(
        `🔄 Task status updated to:`,
        taskUpdateResult.rows[0]?.status || "no task found"
      );
      console.error(
        `❌ Note generation failed for file: ${file.filename}: ${error}`
      );
    } else {
      console.warn(`⚠️ Unexpected webhook status:`, {
        status,
        hasNotes: !!notes,
        fileId,
      });
    }

    console.log(`✅ Webhook processed successfully for file ${fileId}`);
    res.json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Alternative webhook endpoint (in case Make.com needs a different path)
router.post("/make-webhook", webhookCors, async (req, res) => {
  console.log("🔔 Alternative Make.com webhook endpoint accessed");
  // Redirect to main webhook handler
  return router.post("/webhook")(req, res);
});

// Manual webhook test endpoint (for testing webhook processing)
router.post("/test-webhook", webhookCors, async (req, res) => {
  console.log("🧪 Manual webhook test endpoint accessed");
  console.log("📋 Test webhook payload:", req.body);

  // Simulate what Make.com should send
  const testPayload = {
    fileId: req.body.fileId || 14,
    notes: req.body.notes || {
      soapNote:
        "This is a TEST SOAP note generated by AI for testing purposes.",
      patientSummary:
        "This is a TEST patient summary generated by AI for testing purposes.",
    },
    noteType: req.body.noteType || "both",
    status: req.body.status || "success",
  };

  console.log("🧪 Simulating Make.com webhook with payload:", testPayload);

  // Process the test webhook
  req.body = testPayload;
  return router.post("/webhook")(req, res);
});

// Get notes for a specific file
router.get("/file/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file and notes
    const result = await pool.query(
      `
      SELECT f.*, n.id as note_id, n.note_type, n.content, n.created_at as note_created_at
      FROM files f
      LEFT JOIN notes n ON f.id = n.file_id
      WHERE f.id = $1 AND f.user_id = $2
    `,
      [fileId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.rows[0];
    const notes = result.rows
      .filter((row) => row.note_id)
      .map((row) => ({
        id: row.note_id,
        type: row.note_type,
        content: JSON.parse(row.content),
        createdAt: row.note_created_at,
      }));

    res.json({
      file: {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        fileSize: file.file_size,
        fileType: file.file_type,
        status: file.status,
        createdAt: file.created_at,
      },
      notes,
    });
  } catch (error) {
    console.error("Get notes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all notes for a user
router.get("/user", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE f.user_id = $1";
    let params = [req.user.id];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND f.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `
      SELECT COUNT(*) as total
      FROM files f
      ${whereClause}
    `,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get files with notes
    const result = await pool.query(
      `
      SELECT f.*,
             n.id as note_id,
             n.note_type,
             n.content,
             n.created_at as note_created_at,
             t.status as task_status,
             t.error_message
      FROM files f
      LEFT JOIN notes n ON f.id = n.file_id
      LEFT JOIN tasks t ON f.id = t.file_id AND t.task_type = 'file_processing'
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      [...params, limit, offset]
    );

    const files = result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      fileSize: row.file_size,
      fileType: row.file_type,
      status: row.status,
      taskStatus: row.task_status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      notes: row.note_id
        ? [
            {
              id: row.note_id,
              type: row.note_type,
              content: JSON.parse(row.content),
              createdAt: row.note_created_at,
            },
          ]
        : [],
    }));

    res.json({
      files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get user notes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Download notes as text file
router.get("/download/:noteId", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const noteResult = await pool.query(
      `
      SELECT n.*, f.original_name
      FROM notes n
      JOIN files f ON n.file_id = f.id
      WHERE n.id = $1 AND f.user_id = $2
    `,
      [noteId, req.user.id]
    );

    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    const note = noteResult.rows[0];
    const content = JSON.parse(note.content);

    // Generate filename
    const timestamp = new Date(note.created_at).toISOString().split("T")[0];
    const filename = `${timestamp}_${
      note.note_type
    }_${note.original_name.replace(/\.[^/.]+$/, "")}.txt`;

    // Convert content to text
    let textContent = `Notes Generated: ${new Date(
      note.created_at
    ).toLocaleString()}\n`;
    textContent += `File: ${note.original_name}\n`;
    textContent += `Type: ${note.note_type}\n`;
    textContent += `\n${"=".repeat(50)}\n\n`;

    if (typeof content === "object") {
      Object.entries(content).forEach(([key, value]) => {
        textContent += `${key.toUpperCase()}:\n${value}\n\n`;
      });
    } else {
      textContent += content;
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(textContent);
  } catch (error) {
    console.error("Download notes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
