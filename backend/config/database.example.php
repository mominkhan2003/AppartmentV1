<?php
declare(strict_types=1);

/**
 * Safe configuration template.
 * Copy this file to config/database.php (keep it OUTSIDE public_html on cPanel) and fill in the
 * credentials you created in cPanel → "MySQL Databases". The database.php file is git-ignored.
 */

return [
    'host' => 'localhost',
    'database' => 'YOUR_CPANEL_DATABASE_NAME',
    'username' => 'YOUR_CPANEL_DATABASE_USER',
    'password' => 'YOUR_DATABASE_PASSWORD',
    'charset' => 'utf8mb4',

    // ---- Optional application settings (defaults are used for missing keys) -------------------
    // Where uploaded media files are stored. Prefer a directory OUTSIDE public_html:
    // 'uploads_dir' => '/home/YOUR_CPANEL_USER/flatmate-uploads',
    'uploads_dir' => null,
    'session_lifetime_days' => 30,
    'default_locale' => 'en',
    'timezone' => 'Europe/Vienna',
    // Optional comma-separated additional allowed CORS origins for local development, e.g.
    // 'cors_origins' => 'http://localhost:5173'  (production uses same-origin and needs none)
    'cors_origins' => '',
    // SMTP/mail: cPanel hosts can send through PHP mail(); when disabled, password-reset tokens
    // are issued to administrators in the admin portal instead of by e-mail.
    'mail_enabled' => false,
    'mail_from' => 'no-reply@YOUR-DOMAIN.tld',
    // Debug mode: NEVER enable on production. Allows dev-only reset-token responses.
    'app_debug' => false,
    'auth_session_cookie' => 'fmsession',
];
