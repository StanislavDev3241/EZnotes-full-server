-- Clean up the specific corrupted note with ID 5
DELETE FROM encrypted_saved_notes WHERE id = 5;

-- Show remaining encrypted notes
SELECT COUNT(*) as remaining_encrypted_notes FROM encrypted_saved_notes;

-- Show the note that was deleted
SELECT 'Note ID 5 has been deleted' as status; 