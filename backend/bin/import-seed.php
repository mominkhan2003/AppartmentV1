<?php
declare(strict_types=1);

/**
 * Imports database/seed.sql (safe demo data, no credentials).
 * Usage: php backend/bin/import-seed.php
 */
declare(strict_types=1);

require __DIR__ . '/../src/Database.php';
$config = require __DIR__ . '/../config/bootstrap.php';
if (!is_array($config)) {
    fwrite(STDERR, "database.php is missing your credentials; copy backend/config/database.example.php first.\n");
    exit(1);
}
Database::configure($config);
$seed = file_get_contents(dirname(__DIR__, 2) . '/database/seed.sql');
if ($seed === false) {
    fwrite(STDERR, "seed.sql not found\n");
    exit(1);
}
foreach (preg_split('/;\s*\n/', $seed) ?: [] as $statement) {
    $statement = trim($statement);
    if ($statement === '' || str_starts_with($statement, '--')) {
        continue;
    }
    try {
        Database::get()->exec($statement);
        echo "  ok: " . mb_substr(str_replace("\n", ' ', $statement), 0, 80) . "...\n";
    } catch (Throwable $e) {
        fwrite(STDERR, 'FAILED: ' . $e->getMessage() . "\n  " . mb_substr(str_replace("\n", ' ', $statement), 0, 160) . "\n");
    }
}
echo "Seed data imported.\n";
