<?php
declare(strict_types=1);

/**
 * Real MySQL connection settings. KEEP THIS FILE SECRET:
 * on cPanel place it OUTSIDE public_html (e.g. /home/<user>/flatmate-config/database.php)
 * and point APP_CONFIG_DIR to that directory. cPanel's ~/flatmate-config is also detected.
 *
 * Copy database.example.php to database.php in your private location and fill in your credentials.
 * Never commit this file (it is git-ignored) and never expose it to the browser.
 */

require_once __DIR__ . '/locate.php';
$__configDir = flatmateConfigDirectory();
if ($__configDir === null) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Database configuration is missing. Create ~/flatmate-config/database.php from config/database.example.php, or set APP_CONFIG_DIR to the private config directory.']);
    exit;
}

$__databaseConfig = require $__configDir . '/database.php';
if (!flatmateDatabaseConfigIsValid($__databaseConfig)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Database configuration is invalid. Check the host, database, username, and password fields without placing credentials in public_html.']);
    exit;
}

return $__databaseConfig;
