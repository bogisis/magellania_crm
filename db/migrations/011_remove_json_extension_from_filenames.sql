-- Migration 011: Remove .json extension from all filenames in estimates table
-- Date: 2025-11-29
-- Reason: Autosave fix (d9af31d) changed format to save WITHOUT .json
--         But existing estimates still have .json in filename field
--         This migration ensures consistency across all estimates
--
-- IDEMPOTENT: Safe to run multiple times

-- Update all filenames that end with .json
-- Remove the .json extension to match new format
UPDATE estimates
SET
    filename = SUBSTR(filename, 1, LENGTH(filename) - 5),  -- Remove last 5 chars (.json)
    updated_at = strftime('%s', 'now')
WHERE filename LIKE '%.json'
  AND deleted_at IS NULL;

-- Verification query (should return 0 after migration)
-- SELECT COUNT(*) as remaining_with_json FROM estimates WHERE filename LIKE '%.json' AND deleted_at IS NULL;
