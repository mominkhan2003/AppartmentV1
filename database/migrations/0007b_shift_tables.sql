
-- shift planning (volunteer sign-ups; "volunteers" are active residents in this household app — documented)
CREATE TABLE event_shifts (
  id        CHAR(36) NOT NULL,
  event_id  CHAR(36) NOT NULL,
  name      VARCHAR(120) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at   DATETIME NULL,
  slots     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  notes     VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_shifts_event (event_id),
  CONSTRAINT fk_shifts_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT ck_shifts_ends CHECK (ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shift_assignments (
  shift_id    CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  status      ENUM('planned','confirmed','declined') NOT NULL DEFAULT 'planned',
  note        VARCHAR(300) NULL,
  created_by  CHAR(36) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shift_id, resident_id),
  CONSTRAINT fk_sa_shift    FOREIGN KEY (shift_id)    REFERENCES event_shifts (id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_resident FOREIGN KEY (resident_id) REFERENCES residents (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
