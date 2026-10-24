<?php
declare(strict_types=1);

/**
 * Runs versioned migrations in database/migrations against the configured MySQL database.
 * Applied versions are tracked in schema_migrations; re-running is a no-op (idempotent).
 *
 * Usage (from project root):  php backend/bin/migrate.php
 * Or set APP_CONFIG_DIR when the private config lives elsewhere.
 */
declare(strict_types=1);
error_reporting(E_ALL);

require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Http.php';
require __DIR__ . '/../src/Uuid.php';
$configRef = require __DIR__ . '/../config/bootstrap.php';
if (!is_array($configRef)) {
    fwrite(STDERR, "database.php is missing your credentials; copy backend/config/database.example.php first.\n");
    exit(1);
}
Database::configure($configRef);

$migrationsDir = dirname(__DIR__, 2) . '/database/migrations';
$pdo = Database::get();
$pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(10) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB");

$files = glob($migrationsDir . '/*.sql') ?: [];
sort($files);
$applied = array_map(fn ($r) => $r['version'],
    Database::all('SELECT version FROM schema_migrations'));

foreach ($files as $file) {
    $version = substr(basename((string) $file), 0, strpos(basename((string) $file), '_')) ?: basename((string) $file);
    if (in_array($version, $applied, true)) {
        echo "  [skip] {$version} already applied\n";
        continue;
    }
    echo "  [apply] {$version}\n";
    $sql = (string) file_get_contents((string) $file);
    // MySQL cannot always run multi-statement through one PDO exec; split on ;\n boundaries.
    foreach (preg_split('/;\s*\n/', $sql) ?: [] as $statement) {
        // Strip whole-line SQL comments; a leading "--" must not discard the statement below it.
        $lines = preg_split('/\R/', (string) $statement) ?: [];
        $lines = array_filter($lines, fn ($line) => !str_starts_with(ltrim($line), '--'));
        $statement = trim(implode("\n", $lines));
        if ($statement === '') {
            continue;
        }
        try {
            (new PDOStatementRunner())->run($statement);
        } catch (Throwable $e) {
            fwrite(STDERR, "FAILED in {$version}:\n  {$e->getMessage()}\n  statement: " . mb_substr($statement, 0, 120) . "...\n");
            exit(1);
        }
    }
    (new PDOStatementRunner())->runWithParams('INSERT INTO schema_migrations (version) VALUES (?)', [$version]);
}
echo "All migrations processed.\n";
echo "Next: php backend/bin/import-seed.php (optional demo data), php backend/bin/create-admin.php\n";

final class PDOStatementRunner
{
    public function run(string $statement): void
    {
        Database::get()->exec($statement);
    }

    public function runWithParams(string $statement, array $params): void
    {
        $st = Database::get()->prepare($statement);
        $st->execute($params);
    }
}
