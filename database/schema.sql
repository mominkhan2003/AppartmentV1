-- FlatMate Hub — importable initial schema (MySQL 8.0+ / MariaDB compatible).
-- Generated state = migrations 0001 … 0010. Prefer running database/migrations/*.sql in order for an
-- upgrade-style import; this file is the same final state in one script for a fresh cPanel database.
-- See DEPLOYMENT.md for creating the database and importing this file.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE app_users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(254) NOT NULL,
  username      VARCHAR(40)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  approved      TINYINT(1)   NOT NULL DEFAULT 1,
  force_password_change TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_email (email),
  UNIQUE KEY uq_app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  id      CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role    ENUM('admin','resident') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_role (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spaces (
  id         CHAR(36)     NOT NULL,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(120) NOT NULL,
  kind       ENUM('bedroom','kitchen','hall','balcony','washroom','storage','other') NOT NULL,
  shape      JSON         NOT NULL,
  capacity   INT          NOT NULL DEFAULT 0,
  notes      TEXT         NULL,
  sort       INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  email        VARCHAR(254) NULL UNIQUE,
  phone        VARCHAR(40)  NULL,
  room_id      CHAR(36)     NULL,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  can_view_finance TINYINT(1) NOT NULL DEFAULT 1,
  is_sample    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_residents_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_residents_room FOREIGN KEY (room_id) REFERENCES spaces (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE household_groups (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_members (
  group_id    CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  PRIMARY KEY (group_id, resident_id),
  CONSTRAINT fk_gm_group    FOREIGN KEY (group_id)    REFERENCES household_groups (id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_resident FOREIGN KEY (resident_id) REFERENCES residents (id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id   CHAR(36)  NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40) NOT NULL,
  entity_id  VARCHAR(36) NULL,
  details    JSON        NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind              ENUM('shared','claim')                        NOT NULL,
  funding_source    ENUM('pool','direct') NOT NULL DEFAULT 'pool',
  group_id          CHAR(36)      NULL,
  title             VARCHAR(120)  NOT NULL,
  description       VARCHAR(2000) NULL,
  category          VARCHAR(40)   NOT NULL DEFAULT 'general',
  round_label       VARCHAR(60)   NULL,
  amount_cents      BIGINT        NOT NULL,
  expense_date      DATE          NOT NULL,
  payer_resident_id CHAR(36)      NULL,
  items             JSON          NULL,
  notes             TEXT          NULL,
  receipt_media_id  CHAR(36)      NULL,
  receipt_hash      CHAR(64)      NULL,
  status            ENUM('pending','approved','rejected','voided') NOT NULL DEFAULT 'pending',
  created_by        CHAR(36)      NULL,
  reviewed_by       CHAR(36)      NULL,
  reviewed_at       DATETIME      NULL,
  review_note       TEXT          NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_expenses_date (expense_date),
  KEY ix_expenses_status (status),
  KEY ix_expenses_group (group_id),
  KEY ix_expenses_payer (payer_resident_id),
  KEY ix_expenses_hash (receipt_hash),
  CONSTRAINT fk_expenses_group   FOREIGN KEY (group_id)          REFERENCES household_groups (id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_payer   FOREIGN KEY (payer_resident_id) REFERENCES residents (id)        ON DELETE SET NULL,
  CONSTRAINT fk_expenses_creator FOREIGN KEY (created_by)        REFERENCES app_users (id)        ON DELETE SET NULL,
  CONSTRAINT ck_expenses_amount CHECK (amount_cents > 0),
  CONSTRAINT ck_expenses_title CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 120),
  CONSTRAINT ck_expenses_description CHECK (description IS NULL OR CHAR_LENGTH(description) <= 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expense_shares (
  id           CHAR(36)        NOT NULL,
  expense_id   BIGINT UNSIGNED NOT NULL,
  resident_id  CHAR(36)        NOT NULL,
  amount_cents BIGINT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_expense_resident (expense_id, resident_id),
  KEY ix_shares_resident (resident_id),
  CONSTRAINT fk_shares_expense FOREIGN KEY (expense_id)  REFERENCES expenses (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_shares_resident FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ledger_entries (
  id           CHAR(36)        NOT NULL,
  resident_id  CHAR(36)        NOT NULL,
  kind         ENUM('share','claim_credit','payment','adjustment') NOT NULL,
  amount_cents BIGINT          NOT NULL,
  entry_date   DATE            NULL,
  expense_id   BIGINT UNSIGNED NULL,
  note         VARCHAR(500)    NULL,
  round_label  VARCHAR(60)     NULL,
  source       ENUM('cash','direct','adjustment') NOT NULL DEFAULT 'cash',
  sort_order   INT             NOT NULL DEFAULT 0,
  created_by   CHAR(36)        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ledger_resident (resident_id),
  KEY ix_ledger_expense (expense_id),
  KEY ix_ledger_created (created_at),
  CONSTRAINT fk_ledger_resident FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_expense  FOREIGN KEY (expense_id)  REFERENCES expenses (id) ON DELETE SET NULL,
  CONSTRAINT fk_ledger_creator  FOREIGN KEY (created_by)  REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW resident_balances AS
SELECT r.id AS resident_id,
       COALESCE(SUM(l.amount_cents), 0) AS balance_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'share' THEN -l.amount_cents ELSE 0 END), 0) AS shares_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'claim_credit' THEN l.amount_cents ELSE 0 END), 0) AS credits_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'payment' THEN l.amount_cents ELSE 0 END), 0) AS payments_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'adjustment' THEN l.amount_cents ELSE 0 END), 0) AS adjustments_cents
FROM residents r LEFT JOIN ledger_entries l ON l.resident_id = r.id
GROUP BY r.id;

CREATE TABLE contribution_rounds (
  id                    CHAR(36)     NOT NULL,
  round_no              INT          NOT NULL,
  label                 VARCHAR(60)  NOT NULL,
  target_per_member_cents BIGINT     NOT NULL DEFAULT 0,
  collected_on          DATE         NOT NULL,
  note                  VARCHAR(500) NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_contribution_round_no (round_no),
  KEY ix_contribution_round_date (collected_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contribution_dues (
  round_id      CHAR(36) NOT NULL,
  resident_id   CHAR(36) NOT NULL,
  required_cents BIGINT  NOT NULL DEFAULT 0,
  paid_cents    BIGINT   NOT NULL DEFAULT 0,
  status        ENUM('settled','pending','partial','credit') NOT NULL DEFAULT 'pending',
  note          VARCHAR(500) NULL,
  PRIMARY KEY (round_id, resident_id),
  KEY ix_contribution_dues_resident (resident_id),
  CONSTRAINT fk_dues_round    FOREIGN KEY (round_id)    REFERENCES contribution_rounds (id) ON DELETE CASCADE,
  CONSTRAINT fk_dues_resident FOREIGN KEY (resident_id) REFERENCES residents (id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chores (
  id                  CHAR(36)     NOT NULL,
  name                VARCHAR(120) NOT NULL,
  kind                ENUM('washroom','hall','kitchen','garbage','other') NOT NULL,
  space_id            CHAR(36)     NULL,
  frequency_days      INT          NOT NULL DEFAULT 7,
  rotates             TINYINT(1)   NOT NULL DEFAULT 1,
  current_resident_id CHAR(36)     NULL,
  next_due            DATE         NOT NULL,
  needed_reported_at  DATETIME     NULL,
  active              TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_chores_space (space_id),
  KEY ix_chores_due (next_due),
  CONSTRAINT fk_chores_space FOREIGN KEY (space_id) REFERENCES spaces (id) ON DELETE SET NULL,
  CONSTRAINT fk_chores_current FOREIGN KEY (current_resident_id) REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT ck_chores_frequency CHECK (frequency_days BETWEEN 1 AND 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chore_members (
  chore_id    CHAR(36) NOT NULL,
  resident_id CHAR(36) NOT NULL,
  position    INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (chore_id, resident_id),
  KEY ix_cm_resident (resident_id),
  CONSTRAINT fk_cm_chore    FOREIGN KEY (chore_id)    REFERENCES chores (id)    ON DELETE CASCADE,
  CONSTRAINT fk_cm_resident FOREIGN KEY (resident_id) REFERENCES residents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chore_events (
  id                 CHAR(36) NOT NULL,
  chore_id           CHAR(36) NOT NULL,
  event_type         ENUM('complete','skip','reassign','reset','report_needed') NOT NULL,
  resident_id        CHAR(36)      NULL,
  target_resident_id CHAR(36)      NULL,
  actor_id           CHAR(36)      NULL,
  reason             VARCHAR(500)  NULL,
  photo_media_id     CHAR(36)      NULL,
  due_date           DATE          NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_chore_events_chore (chore_id),
  KEY ix_chore_events_created (created_at),
  CONSTRAINT fk_ce_chore    FOREIGN KEY (chore_id)           REFERENCES chores (id)    ON DELETE CASCADE,
  CONSTRAINT fk_ce_resident FOREIGN KEY (resident_id)        REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_target   FOREIGN KEY (target_resident_id) REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_actor    FOREIGN KEY (actor_id)           REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE issues (
  id                   CHAR(36)      NOT NULL,
  space_id             CHAR(36)      NULL,
  category             VARCHAR(40)   NOT NULL DEFAULT 'cleanliness',
  description          TEXT          NOT NULL,
  photo_media_id       CHAR(36)      NULL,
  reporter_id          CHAR(36)      NULL,
  reporter_resident_id CHAR(36)      NULL,
  status               ENUM('open','acknowledged','in_progress','resolved') NOT NULL DEFAULT 'open',
  assigned_resident_id CHAR(36)      NULL,
  admin_response       TEXT          NULL,
  resolution_notes     TEXT          NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_issues_status (status),
  KEY ix_issues_space (space_id),
  KEY ix_issues_created (created_at),
  CONSTRAINT fk_reporter_resident FOREIGN KEY (reporter_resident_id) REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT fk_issues_space     FOREIGN KEY (space_id)              REFERENCES spaces (id)    ON DELETE SET NULL,
  CONSTRAINT fk_issues_reporter  FOREIGN KEY (reporter_id)           REFERENCES app_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_issues_assignee  FOREIGN KEY (assigned_resident_id)  REFERENCES residents (id) ON DELETE SET NULL,
  CONSTRAINT ck_issues_description CHECK (CHAR_LENGTH(description) BETWEEN 3 AND 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_roles (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  description TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_roles_name (name (60)),
  CONSTRAINT ck_portal_role_name CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 2 AND 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_role_permissions (
  role_id    CHAR(36) NOT NULL,
  permission ENUM('household.manage','issues.manage','audit.read') NOT NULL,
  PRIMARY KEY (role_id, permission),
  CONSTRAINT fk_prp_role FOREIGN KEY (role_id) REFERENCES portal_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_role_members (
  role_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (role_id, user_id),
  KEY ix_prm_user (user_id),
  CONSTRAINT fk_prm_role FOREIGN KEY (role_id) REFERENCES portal_roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_prm_user FOREIGN KEY (user_id) REFERENCES app_users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hub_items (
  id         CHAR(36)     NOT NULL,
  kind       ENUM('shopping','notices','events','bookings','polls','inventory','documents','contacts','rules','lost-found') NOT NULL,
  title      VARCHAR(160) NOT NULL,
  details    VARCHAR(2000) NOT NULL,
  payload    JSON         NOT NULL,
  status     ENUM('open','done') NOT NULL DEFAULT 'open',
  created_by CHAR(36)     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_hub_items_kind_created (kind, created_at),
  CONSTRAINT fk_hub_creator FOREIGN KEY (created_by) REFERENCES app_users (id) ON DELETE CASCADE,
  CONSTRAINT ck_hub_title CHECK (CHAR_LENGTH(TRIM(title)) BETWEEN 1 AND 160),
  CONSTRAINT ck_hub_details CHECK (CHAR_LENGTH(details) <= 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hub_responses (
  item_id    CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  value      VARCHAR(40)  NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, user_id),
  KEY ix_hub_responses_user (user_id),
  CONSTRAINT fk_hr_item FOREIGN KEY (item_id) REFERENCES hub_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_user FOREIGN KEY (user_id) REFERENCES app_users (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE media_assets (
  id            CHAR(36)             NOT NULL,
  bucket        ENUM('media','receipts','photos','social') NOT NULL,
  owner_user_id CHAR(36)             NULL,
  file_path     VARCHAR(255)         NOT NULL,
  original_name VARCHAR(255)         NULL,
  mime_type     VARCHAR(100)         NOT NULL,
  size_bytes    BIGINT UNSIGNED      NOT NULL,
  width         SMALLINT UNSIGNED    NULL,
  height        SMALLINT UNSIGNED    NULL,
  alt_text      VARCHAR(255)         NULL,
  caption       VARCHAR(255)         NULL,
  checksum      CHAR(64)             NULL,
  created_by    CHAR(36)             NULL,
  created_at    DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_path (file_path),
  KEY ix_media_bucket (bucket),
  KEY ix_media_created (created_at),
  CONSTRAINT fk_media_owner   FOREIGN KEY (owner_user_id) REFERENCES app_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_media_creator FOREIGN KEY (created_by)    REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE expenses      ADD CONSTRAINT fk_expenses_receipt FOREIGN KEY (receipt_media_id) REFERENCES media_assets (id) ON DELETE SET NULL;
ALTER TABLE issues        ADD CONSTRAINT fk_issues_photo     FOREIGN KEY (photo_media_id)   REFERENCES media_assets (id) ON DELETE SET NULL;
ALTER TABLE chore_events  ADD CONSTRAINT fk_ce_photo         FOREIGN KEY (photo_media_id)   REFERENCES media_assets (id) ON DELETE SET NULL;

CREATE TABLE auth_sessions (
  token_hash   CHAR(64)  NOT NULL,
  user_id      CHAR(36)  NOT NULL,
  created_at   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME  NOT NULL,
  last_used_at DATETIME  NULL,
  created_ip   VARCHAR(45) NULL,
  user_agent   VARCHAR(255) NULL,
  PRIMARY KEY (token_hash),
  KEY ix_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  token_hash CHAR(64)  NOT NULL,
  user_id    CHAR(36)  NOT NULL,
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME  NOT NULL,
  used_at    DATETIME  NULL,
  PRIMARY KEY (token_hash),
  KEY ix_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email        VARCHAR(254) NOT NULL,
  ip           VARCHAR(45)  NULL,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success      TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_attempts_email_time (email, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id         CHAR(36)     NOT NULL,
  audience   ENUM('admin','user') NOT NULL DEFAULT 'admin',
  user_id    CHAR(36)     NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500) NULL,
  link       VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notifications_created (created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_reads (
  notification_id CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  read_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  CONSTRAINT fk_nread_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE,
  CONSTRAINT fk_nread_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_sections (
  code           VARCHAR(60)  NOT NULL,
  area           ENUM('home','nav','footer','donations') NOT NULL DEFAULT 'home',
  kind           ENUM('hero','feature','section','page','link') NOT NULL DEFAULT 'section',
  icon           VARCHAR(40)  NULL,
  sort           INT          NOT NULL DEFAULT 0,
  visible        TINYINT(1)   NOT NULL DEFAULT 1,
  media_id       CHAR(36)     NULL,
  media_position ENUM('cover','left','right','center','background') NULL,
  cta_label      VARCHAR(120) NULL,
  cta_href       VARCHAR(500) NULL,
  cta2_label     VARCHAR(120) NULL,
  cta2_href      VARCHAR(500) NULL,
  updated_by     CHAR(36)     NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  KEY ix_site_sections_area_sort (area, sort),
  CONSTRAINT fk_section_media  FOREIGN KEY (media_id)   REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_section_editor FOREIGN KEY (updated_by) REFERENCES app_users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_section_translations (
  section_code VARCHAR(60)  NOT NULL,
  locale       ENUM('de','en') NOT NULL,
  heading      VARCHAR(300) NULL,
  subheading   VARCHAR(300) NULL,
  body         TEXT         NULL,
  PRIMARY KEY (section_code, locale),
  CONSTRAINT fk_sst_section FOREIGN KEY (section_code) REFERENCES site_sections (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_settings (
  setting_key   VARCHAR(60) NOT NULL,
  setting_value TEXT        NOT NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
  id              CHAR(36)      NOT NULL,
  slug            VARCHAR(180)  NOT NULL,
  status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  category        ENUM('community','cooking','organizing','cleaning','other') NOT NULL DEFAULT 'other',
  starts_at       DATETIME      NOT NULL,
  ends_at         DATETIME      NULL,
  timezone        VARCHAR(64)   NOT NULL DEFAULT 'Europe/Vienna',
  meeting_point   VARCHAR(255)  NULL,
  address         VARCHAR(255)  NULL,
  cover_media_id  CHAR(36)      NULL,
  additional_info VARCHAR(2000) NULL,
  published_at    DATETIME      NULL,
  created_by      CHAR(36)      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_slug (slug),
  KEY ix_events_status_date (status, starts_at),
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by)     REFERENCES app_users (id)    ON DELETE SET NULL,
  CONSTRAINT fk_events_cover  FOREIGN KEY (cover_media_id)  REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT ck_events_ends CHECK (ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_translations (
  event_id    CHAR(36)     NOT NULL,
  locale      ENUM('de','en') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  PRIMARY KEY (event_id, locale),
  CONSTRAINT fk_et_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_gallery (
  event_id CHAR(36) NOT NULL,
  media_id CHAR(36) NOT NULL,
  sort     INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, media_id),
  CONSTRAINT fk_eg_event FOREIGN KEY (event_id) REFERENCES events (id)      ON DELETE CASCADE,
  CONSTRAINT fk_eg_media FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_shifts (
  id        CHAR(36)     NOT NULL,
  event_id  CHAR(36)     NOT NULL,
  name      VARCHAR(120) NOT NULL,
  starts_at DATETIME     NOT NULL,
  ends_at   DATETIME     NULL,
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
  note        VARCHAR(300)     NULL,
  created_by  CHAR(36)         NULL,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shift_id, resident_id),
  CONSTRAINT fk_sa_shift    FOREIGN KEY (shift_id)    REFERENCES event_shifts (id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_resident FOREIGN KEY (resident_id) REFERENCES residents (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donation_categories (
  id          CHAR(36)    NOT NULL,
  name        VARCHAR(80) NOT NULL,
  description TEXT        NULL,
  sort        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donation_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donation_requests (
  id             CHAR(36)      NOT NULL,
  contact_name   VARCHAR(120)  NOT NULL,
  contact_email  VARCHAR(254)  NOT NULL,
  contact_phone  VARCHAR(40)   NULL,
  amount_cents   BIGINT UNSIGNED NULL,
  category_id    CHAR(36)      NULL,
  message        VARCHAR(2000) NULL,
  status         ENUM('new','credited','declined','spam') NOT NULL DEFAULT 'new',
  internal_notes VARCHAR(2000) NULL,
  request_ip     VARCHAR(45)   NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_requests_status (status),
  KEY ix_requests_created (created_at),
  CONSTRAINT fk_requests_category FOREIGN KEY (category_id) REFERENCES donation_categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donation_transactions (
  id               CHAR(36)        NOT NULL,
  category_id      CHAR(36)        NULL,
  amount_cents     BIGINT UNSIGNED NOT NULL,
  transaction_date DATE            NOT NULL,
  method           ENUM('bank_transfer','cash','other') NOT NULL DEFAULT 'bank_transfer',
  reference        VARCHAR(120)    NULL,
  donor_name       VARCHAR(120)    NULL,
  request_id       CHAR(36)        NULL,
  note             VARCHAR(500)    NULL,
  entered_by       CHAR(36)        NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_transactions_date (transaction_date),
  KEY ix_transactions_category (category_id),
  KEY ix_transactions_request (request_id),
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES donation_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_request  FOREIGN KEY (request_id)  REFERENCES donation_requests (id)   ON DELETE SET NULL,
  CONSTRAINT fk_transactions_entered  FOREIGN KEY (entered_by)  REFERENCES app_users (id)           ON DELETE SET NULL,
  CONSTRAINT ck_transactions_amount CHECK (amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE social_posts (
  id         CHAR(36)     NOT NULL,
  format     ENUM('square','portrait','story') NOT NULL DEFAULT 'square',
  template   VARCHAR(40)  NOT NULL,
  headline   VARCHAR(120) NULL,
  media_id   CHAR(36)     NULL,
  created_by CHAR(36)     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_social_created (created_at),
  CONSTRAINT fk_social_media   FOREIGN KEY (media_id)   REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_social_creator FOREIGN KEY (created_by) REFERENCES app_users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE social_post_translations (
  post_id CHAR(36)      NOT NULL,
  locale  ENUM('de','en') NOT NULL,
  caption VARCHAR(2200) NULL,
  PRIMARY KEY (post_id, locale),
  CONSTRAINT fk_spt_post FOREIGN KEY (post_id) REFERENCES social_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
