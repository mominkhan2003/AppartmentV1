-- 0007_events_shifts.sql — events with translations, cover/gallery media, and shift planning.
-- Wording lives in event_translations (de/en); dates, meeting point and logistics are locale-independent.

CREATE TABLE events (
  id               CHAR(36) NOT NULL,
  slug             VARCHAR(180) NOT NULL,
  status           ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  category         ENUM('community','cooking','organizing','cleaning','other') NOT NULL DEFAULT 'other',
  starts_at        DATETIME NOT NULL,
  ends_at          DATETIME NULL,
  timezone         VARCHAR(64) NOT NULL DEFAULT 'Europe/Vienna',
  meeting_point    VARCHAR(255) NULL,      -- original: "Treffpunkt"
  address          VARCHAR(255) NULL,
  cover_media_id   CHAR(36) NULL,          -- event cover photo (media_assets)
  additional_info  VARCHAR(2000) NULL,     -- original: "Zusatzinfos"
  published_at     DATETIME NULL,
  created_by       CHAR(36) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_slug (slug),
  KEY ix_events_status_date (status, starts_at),
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES app_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_events_cover  FOREIGN KEY (cover_media_id) REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT ck_events_ends CHECK (ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_translations (
  event_id    CHAR(36) NOT NULL,
  locale      ENUM('de','en') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT NULL,
  PRIMARY KEY (event_id, locale),
  CONSTRAINT fk_et_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- junction: events <-> media_assets gallery (cover is events.cover_media_id; gallery rows keep explicit order)
CREATE TABLE event_gallery (
  event_id CHAR(36) NOT NULL,
  media_id CHAR(36) NOT NULL,
  sort     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, media_id),
  CONSTRAINT fk_eg_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_eg_media FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE event_gallery (
  event_id CHAR(36) NOT NULL,
  media_id CHAR(36) NOT NULL,
  sort     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, media_id),
  CONSTRAINT fk_eg_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_eg_media FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
