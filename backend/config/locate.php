<?php
declare(strict_types=1);

/**
 * Resolve the hosting home without assuming PHP expands ~ in paths.
 *
 * @return list<string>
 */
function flatmateConfigHomeDirectories(): array
{
    $homeDirectories = [getenv('HOME'), $_SERVER['HOME'] ?? null, $_ENV['HOME'] ?? null];
    $documentRoot = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($documentRoot !== '') {
        $realDocumentRoot = realpath($documentRoot);
        foreach (array_unique([$documentRoot, $realDocumentRoot ?: $documentRoot]) as $root) {
            if (preg_match('~^(\/home[^/]*/[^/]+)(?:/|$)~', $root, $matches) === 1) {
                $homeDirectories[] = $matches[1];
            }
        }
    }
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $user = posix_getpwuid(posix_geteuid());
        $homeDirectories[] = is_array($user) ? ($user['dir'] ?? null) : null;
    }

    $resolvedHomes = [];
    foreach ($homeDirectories as $homeDirectory) {
        if (is_string($homeDirectory) && trim($homeDirectory) !== '') {
            $homeDirectory = rtrim(trim($homeDirectory), '/\\');
            $resolvedHomes[] = $homeDirectory;
            $realHomeDirectory = realpath($homeDirectory);
            if ($realHomeDirectory !== false) {
                $resolvedHomes[] = rtrim($realHomeDirectory, '/\\');
            }
        }
    }

    return array_values(array_unique($resolvedHomes));
}

/**
 * Return candidate config directories in priority order.
 *
 * @return list<string>
 */
function flatmateConfigCandidates(): array
{
    $candidates = [];
    $homeDirectories = flatmateConfigHomeDirectories();

    $configuredDirectory = getenv('APP_CONFIG_DIR');
    if (!is_string($configuredDirectory) || trim($configuredDirectory) === '') {
        $configuredDirectory = $_SERVER['APP_CONFIG_DIR'] ?? $_ENV['APP_CONFIG_DIR'] ?? null;
    }
    if (is_string($configuredDirectory) && trim($configuredDirectory) !== '') {
        $configuredDirectory = trim($configuredDirectory);
        if ($configuredDirectory === '~') {
            $configuredDirectory = $homeDirectories[0] ?? $configuredDirectory;
        } elseif (str_starts_with($configuredDirectory, '~/')) {
            $configuredDirectory = isset($homeDirectories[0])
                ? $homeDirectories[0] . substr($configuredDirectory, 1)
                : $configuredDirectory;
        }
        $candidates[] = rtrim($configuredDirectory, '/\\');
    }

    foreach ($homeDirectories as $homeDirectory) {
        $candidates[] = $homeDirectory . '/flatmate-config';
    }

    $documentRoots = [(string) ($_SERVER['DOCUMENT_ROOT'] ?? '')];
    if ($documentRoots[0] !== '') {
        $realDocumentRoot = realpath($documentRoots[0]);
        if ($realDocumentRoot !== false) {
            $documentRoots[] = $realDocumentRoot;
        }
    }
    foreach (array_unique($documentRoots) as $documentRoot) {
        $directory = rtrim($documentRoot, '/\\');
        for ($depth = 0; $directory !== '' && $depth < 12; $depth++) {
            $candidates[] = dirname($directory) . '/flatmate-config';
            $parentDirectory = dirname($directory);
            if ($parentDirectory === $directory) {
                break;
            }
            $directory = $parentDirectory;
        }
    }

    // The private config may also live beside this file (the original cPanel
    // layout). It is protected by the deployment .htaccess, and keeping this
    // fallback last preserves the stricter locations above.
    $candidates[] = __DIR__;
    return array_values(array_unique($candidates));
}

/**
 * Locate the private database config for cPanel, explicit deployments, and local development.
 */
function flatmateConfigDirectory(): ?string
{
    foreach (flatmateConfigCandidates() as $candidateDirectory) {
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
