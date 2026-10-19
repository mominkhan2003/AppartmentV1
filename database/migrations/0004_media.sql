-- 0004_media.sql — media library (replaces Supabase Storage)
-- Files live on disk under the uploads directory (documented in DEPLOYMENT.md); this table stores metadata only.

CREATE TABLE media_assets (
  id            CHAR(36) NOT NULL,
  bucket        ENUM('media','receipts','photos','social') NOT NULL,  -- mirrors the former Supabase buckets
  owner_user_id CHAR(36) NULL,          -- personal uploads ("receipts" bucket duels), NULL = shared/graphic set
  file_path     VARCHAR(255) NOT NULL,  -- relative path inside the uploads directory
  original_name VARCHAR(255) NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  width         SMALLINT UNSIGNED NULL,
  height        SMALLINT UNSIGNED NULL,
  alt_text      VARCHAR(255) NULL,
  caption       VARCHAR(255) NULL,
  checksum      CHAR(64) NULL,
  created_by    CHAR(36) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_path (file_path),
  KEY ix_media_bucket (bucket),
  KEY ix_media_created (created_at),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_user_id) REFERENCES app_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_media_creator FOREIGN KEY (created_by) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deferred FKs from migration 0001 columns now that media_assets exists.
ALTER TABLE expenses      ADD CONSTRAINT fk_expenses_receipt FOREIGN KEY (receipt_media_id)     REFERENCES media_assets (id) ON DELETE SET NULL;
ALTER TABLE issues        ADD CONSTRAINT fk_issues_photo     FOREIGN KEY (photo_media_id)       REFERENCES media_assets (id) ON DELETE SET NULL;
ALTER TABLE chore_events  ADD CONSTRAINT fk_ce_photo         FOREIGN KEY (photo_media_id)       REFERENCES media_assets (id) ON DELETE SET NULL;
