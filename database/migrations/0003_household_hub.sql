-- 0003_household_hub.sql — hub_items / hub_responses (from drizzle/migrations/0002_household_interactive_hub.sql
-- and 0003_household_item_edit.sql)

CREATE TABLE hub_items (
  id          CHAR(36) NOT NULL,
  kind        ENUM('shopping','notices','events','bookings','polls','inventory','documents','contacts','rules','lost-found') NOT NULL,
  title       VARCHAR(160) NOT NULL,
  details     VARCHAR(2000) NOT NULL,
  payload     JSON NOT NULL,      -- per-kind dynamic payload; kind-enumerated, documented — not a violating column
  status      ENUM('open','done') NOT NULL DEFAULT 'open',
  created_by  CHAR(36) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_hub_items_kind_created (kind, created_at),
  CONSTRAINT fk_hub_creator FOREIGN KEY (created_by) REFERENCES app_users (id) ON DELETE CASCADE,
  CONSTRAINT ck_hub_title CHECK (CHAR_LENGTH(TRIM(title)) BETWEEN 1 AND 160),
  CONSTRAINT ck_hub_details CHECK (CHAR_LENGTH(details) <= 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hub_responses (
  item_id    CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  value      VARCHAR(40) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, user_id),
  KEY ix_hub_responses_user (user_id),
  CONSTRAINT fk_hr_item FOREIGN KEY (item_id) REFERENCES hub_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_user FOREIGN KEY (user_id) REFERENCES app_users (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
