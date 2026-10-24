<?php
declare(strict_types=1);

/**
 * Check private config, PDO MySQL connectivity, and the tables in database/schema.sql.
 * Run from the deployment root: php bin/diagnose.php
 */
require __DIR__ . '/../config/locate.php';

function flatmateDiagnosticFail(string $message): never
{
    fwrite(STDERR, "ERROR: {$message}\n");
    exit(1);
}

$configDirectory = flatmateConfigDirectory();
if ($configDirectory === null) {
    fwrite(STDERR, "Checked config directories:\n");
    foreach (flatmateConfigCandidates() as $candidate) {
        $file = $candidate . '/database.php';
        $status = is_file($file) ? (is_readable($file) ? 'present/readable' : 'present/not readable') : 'not found';
        fwrite(STDERR, "  {$file}: {$status}\n");
    }
    flatmateDiagnosticFail('Create database.php in the actual cPanel account home under flatmate-config, or set APP_CONFIG_DIR to its absolute directory. A literal ~ is not expanded by PHP.');
}
echo "Database config found at {$configDirectory}/database.php.\n";

try {
    $config = require $configDirectory . '/database.php';
} catch (Throwable) {
    flatmateDiagnosticFail('The database config file could not be loaded. Check PHP syntax; its contents are not displayed.');
}
if (!flatmateDatabaseConfigIsValid($config)) {
    flatmateDiagnosticFail('Database config is invalid or still contains placeholders. Check host, database, username, and password; values are not displayed.');
}
echo "Database config found; credentials are not displayed.\n";

if (!class_exists(PDO::class) || !in_array('mysql', PDO::getAvailableDrivers(), true)) {
    flatmateDiagnosticFail('PDO MySQL is not enabled for this PHP CLI version.');
}

require __DIR__ . '/../src/Database.php';
Database::configure($config);
try {
    $tables = Database::get()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
} catch (PDOException) {
    flatmateDiagnosticFail('MySQL connection failed. Verify cPanel host, database name, user privileges, and credentials; details were withheld.');
}
echo "MySQL connection succeeded.\n";

$schemaPath = dirname(__DIR__) . '/database/schema.sql';
if (!is_file($schemaPath) || !is_readable($schemaPath)) {
    flatmateDiagnosticFail('database/schema.sql is missing from the deployment; rebuild and upload the complete package.');
}
$schema = file_get_contents($schemaPath);
if (!is_string($schema)) {
    flatmateDiagnosticFail('Could not read database/schema.sql.');
}
preg_match_all('/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z_][A-Za-z0-9_]*)`?/im', $schema, $matches);
$requiredTables = array_values(array_unique($matches[1] ?? []));
if ($requiredTables === []) {
    flatmateDiagnosticFail('No table definitions were found in database/schema.sql.');
}

$availableTables = array_fill_keys(array_map('strtolower', $tables), true);
$missingTables = array_values(array_filter(
    $requiredTables,
    static fn (string $table): bool => !isset($availableTables[strtolower($table)])
));
if ($missingTables !== []) {
    flatmateDiagnosticFail('Missing required MySQL tables: ' . implode(', ', $missingTables) . '. Import database/schema.sql in cPanel phpMyAdmin.');
}

echo 'Required MySQL tables verified: ' . count($requiredTables) . ".\n";
