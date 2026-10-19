-- 0006_site_content.sql — editable homepage/footer/navigation/donation copy.
-- A section row holds locale-independent layout facts (icon, order, visibility, media, CTA destinations);
-- human-readable wording lives in site_section_translations per locale (de/en) — no repeated language columns.

CREATE TABLE site_sections (
  code           VARCHAR(60) NOT NULL,
  area           ENUM('home','nav','footer','donations') NOT NULL DEFAULT 'home',
  kind           ENUM('hero','feature','section','page','link') NOT NULL DEFAULT 'section',
  icon           VARCHAR(40) NULL,
  sort           INT NOT NULL DEFAULT 0,
  visible        TINYINT(1) NOT NULL DEFAULT 1,
  media_id       CHAR(36) NULL, -- hero/background image
  media_position ENUM('cover','left','right','center','background') NULL,
  cta_label      VARCHAR(120) NULL,
  cta_href       VARCHAR(500) NULL,
  cta2_label     VARCHAR(120) NULL,
  cta2_href      VARCHAR(500) NULL,
  updated_by     CHAR(36) NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  KEY ix_site_sections_area_sort (area, sort),
  CONSTRAINT fk_section_media FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_section_editor FOREIGN KEY (updated_by) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_section_translations (
  section_code VARCHAR(60) NOT NULL,
  locale       ENUM('de','en') NOT NULL,
  heading      VARCHAR(300) NULL,
  subheading   VARCHAR(300) NULL,
  body         TEXT NULL,
  PRIMARY KEY (section_code, locale),
  CONSTRAINT fk_sst_section FOREIGN KEY (section_code) REFERENCES site_sections (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Simple single-value settings (bank transfer details, social links, mail sender, …).
CREATE TABLE site_settings (
  setting_key   VARCHAR(60) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
