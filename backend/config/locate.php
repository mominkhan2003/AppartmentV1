<?php
declare(strict_types=1);

/**
 * Locate the private database config for cPanel, explicit deployments, and local development.
 */
function flatmateConfigDirectory(): ?string
{
    $candidates = [];
    $configuredDirectory = getenv('APP_CONFIG_DIR');
    if (is_string($configuredDirectory) && trim($configuredDirectory) !== '') {
        $candidates[] = rtrim(trim($configuredDirectory), '/\\');
    }

    $homeDirectories = [getenv('HOME'), $_SERVER['HOME'] ?? null];
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $user = posix_getpwuid(posix_geteuid());
        $homeDirectories[] = is_array($user) ? ($user['dir'] ?? null) : null;
    }
    foreach ($homeDirectories as $homeDirectory) {
        if (is_string($homeDirectory) && trim($homeDirectory) !== '') {
            $candidates[] = rtrim(trim($homeDirectory), '/\\') . '/flatmate-config';
        }
    }

    $documentRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    for ($directory = $documentRoot, $depth = 0; $directory !== '' && $depth < 8; $depth++) {
        $candidates[] = dirname($directory) . '/flatmate-config';
        $parentDirectory = dirname($directory);
        if ($parentDirectory === $directory) {
            break;
        }
        $directory = $parentDirectory;
    }

    $candidates[] = __DIR__;
    foreach (array_unique($candidates) as $candidateDirectory) {
        if (is_file($candidateDirectory . '/database.php') && is_readable($candidateDirectory . '/database.php')) {
            return $candidateDirectory;
        }
    }

    return null;
}

/**
 * Reject missing or placeholder credentials without exposing their values.
 */
function flatmateDatabaseConfigIsValid(mixed $config): bool
{
    if (!is_array($config)) {
        return false;
    }

    foreach (['host', 'database', 'username', 'password'] as $key) {
        $value = $config[$key] ?? null;
        if (!is_string($value) || trim($value) === '' || str_starts_with($value, 'YOUR_')) {
            return false;
        }
    }

    return true;
}
