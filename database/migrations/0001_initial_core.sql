-- 0001_initial_core.sql — FlatMate Hub MySQL migration, version 0001
-- Migrated from drizzle/migrations/0000_migration.sql (Postgres).
-- Adapter choices:
--   * Postgres gen_random_uuid() -> application-generated UUID v4 stored as CHAR(36) (documented in DEPLOYMENT.md).
--   * Postgres enums -> MySQL ENUM columns with the same identifiers (identifiers are stable API contract).
--   * Postgres RLS (row level security) -> row checks are enforced by the PHP API; MySQL has no RLS.
--   * SECURITY DEFINER RPCs -> transactional endpoints in backend/api using the same rules.
--   * timestamptz -> DATETIME in UTC. The connection sets time_zone = '+00:00'; the API returns ISO 8601 with Z.
--   * jsonb -> JSON columns, documented: only true per-row payloads (dynamic per-kind hub payloads, SVG point
--     vectors, receipt item lists, audit details) use JSON. Lists of people or values are 3NF junction rows.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE app_users (
  id              CHAR(36)     NOT NULL,
  email           VARCHAR(254) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,                -- password_hash() output (bcrypt/argon2id), never plaintext
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  id       CHAR(36) NOT NULL,
  user_id  CHAR(36) NOT NULL,                             -- was: references auth.users(id) on delete cascade
  role     ENUM('admin','resident') NOT NULL,
  UNIQUE KEY uq_user_role (user_id, role),
  KEY ix_user_roles_user (user_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spaces (
  id         CHAR(36) NOT NULL,
  code       VARCHAR(20) NOT NULL,
  name       VARCHAR(120) NOT NULL,
  kind       ENUM('bedroom','kitchen','hall','balcony','washroom','storage','other') NOT NULL,
  shape      JSON NOT NULL,                               -- [[x,y],...] SVG polygon points (numeric vector, kept as JSON)
  capacity   INT NOT NULL DEFAULT 0,
  notes      TEXT NULL,
  sort       INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_spaces_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE washroom_access (
  washroom_id CHAR(36) NOT NULL,
  bedroom_id  CHAR(36) NOT NULL,
  PRIMARY KEY (washroom_id, bedroom_id),
  CONSTRAINT fk_wa_washroom FOREIGN KEY (washroom_id) REFERENCES spaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_bedroom  FOREIGN KEY (bedroom_id)  REFERENCES spaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE residents (
  id            CHAR(36) NOT NULL,
  user_id       CHAR(36) NULL UNIQUE,                     -- NULL until the person creates an account
  display_name  VARCHAR(120) NOT NULL,
  email         VARCHAR(254) NULL UNIQUE,
  phone         VARCHAR(40) NULL,
  room_id       CHAR(36) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  is_sample     TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_residents_user (user_id),
  CONSTRAINT fk_residents_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_residents_room FOREIGN KEY (room_id)   REFERENCES spaces (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE household_groups (
  id          CHAR(36) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- junction table: household_groups <-> residents (many-to-many)
CREATE TABLE group_members (
  group_id    CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  PRIMARY KEY (group_id, resident_id),
  CONSTRAINT fk_gm_group    FOREIGN KEY (group_id)    REFERENCES household_groups (id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_resident FOREIGN KEY (resident_id) REFERENCES residents (id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id   CHAR(36) NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40) NOT NULL,
  entity_id  VARCHAR(36) NULL,
  details    JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind               ENUM('shared','claim') NOT NULL,
  group_id           CHAR(36) NULL,                       -- ON DELETE RESTRICT: keep accounting rows orphans were never
  title              VARCHAR(120) NOT NULL,
  description        VARCHAR(2000) NULL,
  category           VARCHAR(40) NOT NULL DEFAULT 'general',
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  expense_date       DATE NOT NULL,
  payer_resident_id  CHAR(36) NULL,
  items              JSON NULL,
  notes              TEXT NULL,
-- receipt_media_id: CHAR(36) now, FK to media_assets added in migration 0004 (media tables exist by then).
  receipt_hash       CHAR(64) NULL,                       -- duplicate-receipt detection (client SHA-256)
  status             ENUM('pending','approved','rejected','voided') NOT NULL DEFAULT 'pending',
  created_by         CHAR(36) NULL,
  reviewed_by        CHAR(36) NULL,
  reviewed_at        DATETIME NULL,
  review_note        TEXT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_expenses_date (expense_date),
  KEY ix_expenses_status (status),
  KEY ix_expenses_group (group_id),
  KEY ix_expenses_payer (payer_resident_id),
  CONSTRAINT fk_expenses_group   FOREIGN KEY (group_id)          REFERENCES household_groups (id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_payer   FOREIGN KEY (payer_resident_id) REFERENCES residents (id)        ON DELETE SET NULL,
  CONSTRAINT fk_expenses_creator FOREIGN KEY (created_by)        REFERENCES app_users (id)        ON DELETE SET NULL,
  CONSTRAINT ck_expenses_title  CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 120),
  CONSTRAINT ck_expenses_description CHECK (description IS NULL OR CHAR_LENGTH(description) <= 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_shares (
  id            CHAR(36) NOT NULL,
  expense_id    BIGINT UNSIGNED NOT NULL,
  resident_id   CHAR(36) NOT NULL,
  amount_cents  BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_expense_resident (expense_id, resident_id),
  KEY ix_shares_resident (resident_id),
  CONSTRAINT fk_shares_expense FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE RESTRICT,
  CONSTRAINT fk_shares_resident FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ledger_entries (
  id          CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  kind        ENUM('share','claim_credit','payment','adjustment') NOT NULL,
  amount_cents BIGINT NOT NULL,
  expense_id  BIGINT UNSIGNED NULL,
  note        VARCHAR(500) NULL,
  created_by  CHAR(36) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ledger_resident (resident_id),
  KEY ix_ledger_expense (expense_id),
  KEY ix_ledger_created (created_at),
  CONSTRAINT fk_ledger_resident FOREIGN KEY (resident_id) REFERENCES residents (id)        ON DELETE CASCADE,
  CONSTRAINT fk_ledger_expense  FOREIGN KEY (expense_id)  REFERENCES expenses (id) ON DELETE SET NULL,
  CONSTRAINT fk_ledger_creator  FOREIGN KEY (created_by)  REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replacement for the Postgres view resident_balances (aggregates only, no redundancy).
CREATE OR REPLACE VIEW resident_balances AS
SELECT r.id AS resident_id,
       COALESCE(SUM(l.amount_cents), 0) AS balance_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'share' THEN -l.amount_cents ELSE 0 END), 0) AS shares_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'claim_credit' THEN l.amount_cents ELSE 0 END), 0) AS credits_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'payment' THEN l.amount_cents ELSE 0 END), 0) AS payments_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'adjustment' THEN l.amount_cents ELSE 0 END), 0) AS adjustments_cents
FROM residents r JOIN ledger_entries l ON l.resident_id = r.id
GROUP BY r.id;

CREATE TABLE chores (
  id                  CHAR(36) NOT NULL,
  name                VARCHAR(120) NOT NULL,
  kind                ENUM('washroom','hall','kitchen','garbage','other') NOT NULL,
  space_id            CHAR(36) NULL,
  frequency_days      INT NOT NULL DEFAULT 7 CHECK (frequency_days BETWEEN 1 AND 60),
  rotates             TINYINT(1) NOT NULL DEFAULT 1,
  current_resident_id CHAR(36) NULL,
  next_due            DATE NOT NULL,
  needed_reported_at  DATETIME NULL,
  active              TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_chores_space (space_id),
  KEY ix_chores_due (next_due),
  CONSTRAINT fk_chores_space FOREIGN KEY (space_id) REFERENCES spaces (id) ON DELETE SET NULL,
  CONSTRAINT fk_chores_current FOREIGN KEY (current_resident_id) REFERENCES residents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- junction: chores <-> residents rotation order (position kept: rotation IS an ordered projection of this relation)
CREATE TABLE chore_members (
  chore_id    CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (chore_id, resident_id),
  KEY ix_cm_resident (resident_id),
  CONSTRAINT fk_cm_chore    FOREIGN KEY (chore_id)    REFERENCES chores (id)    ON DELETE CASCADE,
  CONSTRAINT fk_cm_resident FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chore_events (
  id                 CHAR(36) NOT NULL,
  chore_id           CHAR(36) NOT NULL,
  event_type         ENUM('complete','skip','reassign','reset','report_needed') NOT NULL,
  resident_id        CHAR(36) NULL,
  target_resident_id CHAR(36) NULL,
  actor_id           CHAR(36) NULL,
  reason             VARCHAR(500) NULL,
  photo_media_id     CHAR(36) NULL,   -- FK to media_assets added in migration 0004
  due_date           DATE NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_chore_events_chore (chore_id),
  KEY ix_chore_events_created (created_at),
  CONSTRAINT fk_ce_chore   FOREIGN KEY (chore_id)           REFERENCES chores (id)    ON DELETE CASCADE,
  CONSTRAINT fk_ce_resident FOREIGN KEY (resident_id)        REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_target  FOREIGN KEY (target_resident_id) REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_actor   FOREIGN KEY (actor_id)           REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE issues (
  id                   CHAR(36) NOT NULL,
  space_id             CHAR(36) NULL,
  category             VARCHAR(40) NOT NULL DEFAULT 'cleanliness',
  description          TEXT NOT NULL CHECK (CHAR_LENGTH(description) BETWEEN 3 AND 2000),
  photo_media_id       CHAR(36) NULL,
  reporter_id          CHAR(36) NULL,
  reporter_resident_id CHAR(36) NULL,
  status               ENUM('open','acknowledged','in_progress','resolved') NOT NULL DEFAULT 'open',
  assigned_resident_id CHAR(36) NULL,
  admin_response       TEXT NULL,
  resolution_notes     TEXT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_issues_status (status),
  KEY ix_issues_space (space_id),
  KEY ix_issues_created (created_at),
  CONSTRAINT fk_reporter_resident FOREIGN KEY (reporter_resident_id) REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_issues_space   FOREIGN KEY (space_id)             REFERENCES spaces (id)     ON DELETE SET NULL,
  CONSTRAINT fk_issues_reporter FOREIGN KEY (reporter_id)         REFERENCES app_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_issues_assignee FOREIGN KEY (assigned_resident_id) REFERENCES residents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

