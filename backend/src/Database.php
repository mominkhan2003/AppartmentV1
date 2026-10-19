<?php
declare(strict_types=1);

/**
 * Reusable PDO connection. One connection per request (see ConnectionPool note).
 * - utf8mb4 everywhere
 * - exceptions on error
 * - all statements prepared (application code may only pass parameters, never build SQL strings from input)
 * - UTC timestamp session so stored DATETIME values are a single unambiguous, locale-free format
 */
final class Database
{
    private static ?PDO $pdo = null;
    private static array $config = [];

    public static function configure(array $config): void
    {
        self::$config = $config;
    }

    public static function get(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $c = self::$config;
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $c['host'], $c['database'], $c['charset'] ?? 'utf8mb4');
        self::$pdo = new PDO($dsn, $c['username'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        self::$pdo->exec("SET time_zone = '+00:00'");
        return self::$pdo;
    }

    /** Shorthand: prepared query -> all rows */
    public static function all(string $sql, array $params = []): array
    {
        $st = self::get()->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    /** Shorthand: prepared query -> single row (or null) */
    public static function row(string $sql, array $params = []): ?array
    {
        $st = self::get()->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    /** Shorthand: prepared statement -> execute (no result expected) */
    public static function run(string $sql, array $params = []): int
    {
        $st = self::get()->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    public static function insertId(): string
    {
        return (string) self::get()->lastInsertId();
    }

    public static function beginTransaction(): void
    {
        self::get()->beginTransaction();
    }

    public static function commit(): void
    {
        if (self::get()->inTransaction()) {
            self::get()->commit();
        }
    }

    public static function rollBack(): void
    {
        if (self::get()->inTransaction()) {
            self::get()->rollBack();
        }
    }
}
