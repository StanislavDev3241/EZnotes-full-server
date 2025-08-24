-- Cleanup script for corrupted encrypted notes
-- This script removes encrypted notes that can't be decrypted due to encryption method changes

-- Delete encrypted notes that have corrupted data
-- We'll keep the regular notes in the 'notes' table which are not encrypted
DELETE FROM encrypted_saved_notes 
WHERE id IN (
  SELECT ens.id 
  FROM encrypted_saved_notes ens
  LEFT JOIN notes n ON ens.file_id = n.file_id AND ens.user_id = n.user_id
  WHERE n.id IS NOT NULL  -- Only delete if there's a corresponding note in the regular notes table
);

-- Alternative: Delete all encrypted notes and let the system recreate them
-- DELETE FROM encrypted_saved_notes;

-- Show remaining encrypted notes
SELECT COUNT(*) as remaining_encrypted_notes FROM encrypted_saved_notes;

-- Show regular notes count
SELECT COUNT(*) as regular_notes FROM notes; 