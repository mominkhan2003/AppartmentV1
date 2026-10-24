-- Financial audit ledger additions: username login, direct store payments,
-- contribution rounds/dues and report ordering.
-- MySQL 8.0+ / MariaDB compatible.

ALTER TABLE app_users
  ADD COLUMN username VARCHAR(40) NULL AFTER email,
  ADD UNIQUE KEY uq_app_users_username (username);

ALTER TABLE expenses
  ADD COLUMN funding_source ENUM('pool','direct') NOT NULL DEFAULT 'pool' AFTER kind,
  ADD COLUMN round_label VARCHAR(60) NULL AFTER category;

ALTER TABLE ledger_entries
  ADD COLUMN entry_date DATE NULL AFTER amount_cents,
  ADD COLUMN round_label VARCHAR(60) NULL AFTER note,
  ADD COLUMN source ENUM('cash','direct','adjustment') NOT NULL DEFAULT 'cash' AFTER round_label,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER source;

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

DROP VIEW IF EXISTS resident_balances;

CREATE OR REPLACE VIEW resident_balances AS
SELECT r.id AS resident_id,
       COALESCE(SUM(l.amount_cents), 0) AS balance_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'share' THEN -l.amount_cents ELSE 0 END), 0) AS shares_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'claim_credit' THEN l.amount_cents ELSE 0 END), 0) AS credits_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'payment' THEN l.amount_cents ELSE 0 END), 0) AS payments_cents,
       COALESCE(SUM(CASE WHEN l.kind = 'adjustment' THEN l.amount_cents ELSE 0 END), 0) AS adjustments_cents
FROM residents r LEFT JOIN ledger_entries l ON l.resident_id = r.id
GROUP BY r.id;
