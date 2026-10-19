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

$__configDirs = [];
$__configuredDir = getenv('APP_CONFIG_DIR');
if (is_string($__configuredDir) && trim($__configuredDir) !== '') {
    $__configDirs[] = rtrim(trim($__configuredDir), '/\\');
}

foreach ([getenv('HOME'), $_SERVER['HOME'] ?? null] as $__homeDir) {
    if (is_string($__homeDir) && trim($__homeDir) !== '') {
        $__configDirs[] = rtrim(trim($__homeDir), '/\\') . '/flatmate-config';
    }
}

// Walk upward from the document root to support primary domains and cPanel addon domains.
$__documentRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
for ($__directory = $__documentRoot, $__depth = 0; $__directory !== '' && $__depth < 5; $__depth++) {
    $__configDirs[] = dirname($__directory) . '/flatmate-config';
    $__parentDirectory = dirname($__directory);
    if ($__parentDirectory === $__directory) {
        break;
    }
    $__directory = $__parentDirectory;
}

// Keep local development working when a private config sits beside this bootstrap file.
$__configDirs[] = __DIR__;
$__configDir = null;
foreach (array_unique($__configDirs) as $__candidateDir) {
    if (is_file($__candidateDir . '/database.php')) {
        $__configDir = $__candidateDir;
        break;
    }
}

if ($__configDir === null) {
    http_response_code(500);
    echo json_encode(['error' => 'Database configuration is missing. Create ~/flatmate-config/database.php from config/database.example.php, verify the file contains your cPanel database credentials, or set APP_CONFIG_DIR to its directory.']);
    exit;
}

/**
 * @return array<string,mixed>
 */
return require $__configDir . '/database.php';
