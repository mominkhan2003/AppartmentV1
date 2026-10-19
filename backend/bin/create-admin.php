<?php
declare(strict_types=1);

/**
 * Creates (or resets the password of) an administrator account. Run once during deployment.
 *   php backend/bin/create-admin.php admin@example.com "A strong password"
 * The first account automatically becomes the administrator (same rule as before the migration).
 * This script never embeds credentials anywhere in the codebase.
 */
declare(strict_types=1);

require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Uuid.php';
$config = require __DIR__ . '/../config/bootstrap.php';
if (!is_array($config)) {
    fwrite(STDERR, "database.php is missing your credentials; copy backend/config/database.example.php first.\n");
    exit(1);
}
Database::configure($config);

if ($argc !== 3) {
    fwrite(STDERR, "Usage: php create-admin.php <email> <password>\n");
    exit(1);
}
[, $email, $password] = $argv;
$email = mb_strtolower(trim($email));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Not a valid email address\n");
    exit(1);
}
if (strlen($password) < 8) {
    fwrite(STDERR, "Use at least 8 characters for the production admin password\n");
    exit(1);
}

$existing = Database::row('SELECT id, email FROM app_users WHERE email = ?', [$email]);
$hash = password_hash($password, PASSWORD_DEFAULT);
Database::beginTransaction();
try {
    if ($existing) {
        Database::run('UPDATE app_users SET password_hash = ? WHERE id = ?', [$hash, $existing['id']]);
        $userId = (string) $existing['id'];
        echo "Password updated for {$email} (user {$userId})\n";
    } else {
        $userId = Uuid::v4();
        Database::run('INSERT INTO app_users (id, email, password_hash) VALUES (?, ?, ?)', [$userId, $email, $hash]);
        Database::run('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [Uuid::v4(), $userId, 'admin']);
        echo "Administrator account created: {$email}\n";
    }
    $resident = Database::row('SELECT id FROM residents WHERE email = ? OR user_id = ?', [$email, $userId]);
    if ($resident) {
        Database::run('UPDATE residents SET user_id = ?, is_sample = 0 WHERE id = ?', [$userId, $resident['id']]);
        echo "Linked to existing resident record.\n";
    } else {
        Database::run('INSERT INTO residents (id, user_id, display_name, email, active) VALUES (?, ?, ?, ?, 1)',
            [Uuid::v4(), $userId, explode('@', $email)[0], $email]);
        echo "Created a linked resident record.\n";
    }
    Database::commit();
} catch (Throwable $e) {
    Database::rollBack();
    fwrite(STDERR, 'FAILED: ' . $e->getMessage() . "\n");
    exit(1);
}
echo "Done. Sign in with this email; delete this password from your shell history if you care about it.\n";
