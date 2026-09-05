-- Migration 001 permitted more than one primary attachment per submission.
-- Preserve every attachment while bringing legacy metadata into the invariant
-- enforced by migration 003. The application reads ready attachments ordered
-- by created_at, id and uses the first primary, so retain that same effective
-- primary. Prefer a ready row over a pending upload; if none is ready, retain
-- the earliest pending row. delete_pending rows are outside the invariant.
WITH ranked_primary_attachments AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY submission_id
      ORDER BY
        CASE WHEN storage_status = 'ready' THEN 0 ELSE 1 END,
        created_at,
        id
    ) AS primary_rank
  FROM attachments
  WHERE kind = 'primary'
    AND storage_status <> 'delete_pending'
)
UPDATE attachments AS attachment
SET kind = 'additional',
    storage_updated_at = NOW()
FROM ranked_primary_attachments AS ranked
WHERE attachment.id = ranked.id
  AND ranked.primary_rank > 1;
