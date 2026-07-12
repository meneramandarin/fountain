-- Persistent image presentation classification for Pass 4 enrichment.

BEGIN;

ALTER TABLE fountain.images
  ADD COLUMN image_kind text;

ALTER TABLE fountain.images
  ADD CONSTRAINT images_image_kind_valid
  CHECK (
    image_kind IS NULL
    OR image_kind IN ('photo', 'logo', 'text_graphic', 'junk')
  );

CREATE INDEX idx_images_unclassified_active_location
  ON fountain.images (id)
  WHERE entity_type = 'location'
    AND status = 'active'
    AND deleted_at IS NULL
    AND image_kind IS NULL;

COMMIT;
