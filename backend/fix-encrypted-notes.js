const { Pool } = require("pg");
const encryptionUtils = require("./encryption-utils");

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || "clearlyAI",
  host: process.env.DB_HOST || "postgres",
  database: process.env.DB_NAME || "clearlyai_db",
  password: process.env.DB_PASSWORD || "clearlyAI123!",
  port: process.env.DB_PORT || 5432,
});

async function fixEncryptedNotes() {
  try {
    console.log("🔧 Starting encrypted notes fix...");

    // Get all encrypted saved notes
    const result = await pool.query(`
      SELECT id, user_id, note_type, note_name, encrypted_content, encryption_iv, content_hash, file_id, conversation_id
      FROM encrypted_saved_notes
      ORDER BY created_at DESC
    `);

    console.log(`📊 Found ${result.rows.length} encrypted notes to check`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const note of result.rows) {
      try {
        console.log(`\n🔍 Checking note ID ${note.id} (${note.note_name})...`);

        // Try to decrypt the note
        let decryptedContent;
        try {
          decryptedContent = encryptionUtils.decryptData(
            note.encrypted_content,
            note.encryption_iv,
            note.user_id
          );
          console.log(`✅ Note ${note.id} decrypts successfully`);
          continue; // Skip if it works
        } catch (decryptError) {
          console.log(
            `❌ Note ${note.id} fails to decrypt: ${decryptError.message}`
          );
        }

        // Try to get content from fallback sources
        let fallbackContent = null;

        // Try notes table
        if (note.file_id) {
          const notesResult = await pool.query(
            `SELECT content FROM notes WHERE file_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [note.file_id, note.user_id]
          );

          if (notesResult.rows.length > 0) {
            fallbackContent = notesResult.rows[0].content;
            console.log(`📄 Found content in notes table for note ${note.id}`);
          } else {
            // Try files table
            const filesResult = await pool.query(
              `SELECT transcription FROM files WHERE id = $1 AND user_id = $2`,
              [note.file_id, note.user_id]
            );

            if (
              filesResult.rows.length > 0 &&
              filesResult.rows[0].transcription
            ) {
              fallbackContent = filesResult.rows[0].transcription;
              console.log(
                `📄 Found content in files table for note ${note.id}`
              );
            }
          }
        }

        if (fallbackContent) {
          // Re-encrypt with current key
          const reEncrypted = encryptionUtils.encryptData(
            fallbackContent,
            note.user_id
          );
          const newContentHash = encryptionUtils.hashData(fallbackContent);

          // Update the note
          await pool.query(
            `UPDATE encrypted_saved_notes 
             SET encrypted_content = $1, encryption_iv = $2, content_hash = $3, updated_at = NOW()
             WHERE id = $4`,
            [reEncrypted.encryptedData, reEncrypted.iv, newContentHash, note.id]
          );

          console.log(
            `✅ Fixed note ${note.id} - re-encrypted with current key`
          );
          fixedCount++;
        } else {
          console.log(`❌ Could not find fallback content for note ${note.id}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing note ${note.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Fix completed:`);
    console.log(`✅ Fixed: ${fixedCount} notes`);
    console.log(`❌ Errors: ${errorCount} notes`);
    console.log(`📄 Total processed: ${result.rows.length} notes`);
  } catch (error) {
    console.error("❌ Script error:", error);
  } finally {
    await pool.end();
  }
}

// Run the script
fixEncryptedNotes();
