-- 0002_portal_roles.sql — custom portal roles (from drizzle/migrations/0001_admin_custom_roles.sql)
-- The Postgres permissions text[] column becomes a junction table (3NF).

CREATE TABLE portal_roles (
  id          CHAR(36) NOT NULL,
  name        VARCHAR(60) NOT NULL,
  description TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
