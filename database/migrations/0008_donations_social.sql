-- 0008_donations_social.sql — donation management and the social-media post studio.
-- Donor identities: donation_requests carry contact details (private, admin-only). Confirmed
-- donation_transactions store an OPTIONAL display name and never render publicly with personal data.

CREATE TABLE donation_categories (
  id          CHAR(36) NOT NULL,
  name        VARCHAR(80) NOT NULL,
  description TEXT NULL,
  sort        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donation_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donation_requests (
  id              CHAR(36) NOT NULL,
  contact_name    VARCHAR(120) NOT NULL,
  contact_email   VARCHAR(254) NOT NULL,
  contact_phone   VARCHAR(40) NULL,
  amount_cents    BIGINT UNSIGNED NULL,
  category_id     CHAR(36) NULL,
  message         VARCHAR(2000) NULL,
  status          ENUM('new','credited','declined','spam') NOT NULL DEFAULT 'new',
  internal_notes  VARCHAR(2000) NULL,
  request_ip      VARCHAR(45) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_requests_status (status),
  KEY ix_requests_created (created_at),
  CONSTRAINT fk_requests_category FOREIGN KEY (category_id) REFERENCES donation_categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donation_transactions (
  id               CHAR(36) NOT NULL,
  category_id      CHAR(36) NULL,
  amount_cents     BIGINT UNSIGNED NOT NULL CHECK (amount_cents > 0),
  transaction_date DATE NOT NULL,
  method           ENUM('bank_transfer','cash','other') NOT NULL DEFAULT 'bank_transfer',
  reference        VARCHAR(120) NULL,
  donor_name       VARCHAR(120) NULL,    -- optional; only in admin views
  request_id       CHAR(36) NULL,        -- links the confirmed promise to its pledge, if any
  note             VARCHAR(500) NULL,
  entered_by       CHAR(36) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_transactions_date (transaction_date),
  KEY ix_transactions_category (category_id),
  KEY ix_transactions_request (request_id),
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES donation_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_request  FOREIGN KEY (request_id)  REFERENCES donation_requests (id)   ON DELETE SET NULL,
  CONSTRAINT fk_transactions_entered  FOREIGN KEY (entered_by)  REFERENCES app_users (id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branded graphics produced in the admin studio; the exported image file is a media asset.
CREATE TABLE social_posts (
  id          CHAR(36) NOT NULL,
  format      ENUM('square','portrait','story') NOT NULL DEFAULT 'square',
  template    VARCHAR(40) NOT NULL,
  headline    VARCHAR(120) NULL,
  media_id    CHAR(36) NULL,
  created_by  CHAR(36) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_social_created (created_at),
  CONSTRAINT fk_social_media  FOREIGN KEY (media_id)   REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_social_creator FOREIGN KEY (created_by) REFERENCES app_users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE social_post_translations (
  post_id CHAR(36) NOT NULL,
  locale  ENUM('de','en') NOT NULL,
  caption VARCHAR(2200) NULL,
  PRIMARY KEY (post_id, locale),
  CONSTRAINT fk_spt_post FOREIGN KEY (post_id) REFERENCES social_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
