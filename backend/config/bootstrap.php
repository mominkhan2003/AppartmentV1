<?php
declare(strict_types=1);

/**
 * Real MySQL connection settings. KEEP THIS FILE SECRET:
 * on cPanel place it OUTSIDE public_html (e.g. /home/<user>/flatmate-config/database.php)
 * and point the APP_CONFIG_DIR environment variable, or edit the __CONFIG_DIR fallback below.
 *
 * Copy database.example.php to database.php in your private location and fill in your credentials.
 * Never commit this file (it is git-ignored) and never expose it to the browser.
 */

// Location priority:
//  1. Environment variable APP_CONFIG_DIR
//  2. A private flatmate-config directory beside the cPanel document root
//  3. A config/ directory next to the backend package (local development)
if ($__configDir = getenv('APP_CONFIG_DIR')) {
    $__configDir = rtrim($__configDir, '/\\');
} else {
    $__documentRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $__privateConfigDir = $__documentRoot !== '' ? dirname($__documentRoot) . '/flatmate-config' : '';
    $__configDir = $__privateConfigDir !== '' && is_file($__privateConfigDir . '/database.php')
        ? $__privateConfigDir
        : __DIR__;
}

if (!is_file($__configDir . '/database.php')) {
    http_response_code(500);
    echo json_encode(['error' => 'Database configuration is missing. Copy config/database.example.php to ~/flatmate-config/database.php and enter your cPanel database credentials, or set APP_CONFIG_DIR.']);
    exit;
}

/**
 * @return array<string,mixed>
 */
return require $__configDir . '/database.php';
