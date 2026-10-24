<?php
declare(strict_types=1);

/**
 * Authentication + authorization. Replaces Supabase Auth (GoTrue).
 *
 * Migration note: Supabase password hashes cannot be re-used by MySQL-backed accounts.
 * New accounts use password_hash()/password_verify(); existing users create a new account
 * or complete an administrator-issued reset. See DEPLOYMENT.md.
 */
final class Auth
{
    private static array $config = [];

    public static function configure(array $config): void
    {
        self::$config = $config;
    }

    public static ?array $user = null;      // app_users row (id, email)
    public static ?array $resident = null;  // linked residents row
    public static bool $isAdmin = false;
    public static bool $approved = true;    // admin-verified accounts only receive portal access
    public static bool $forcePasswordChange = false; // seeded accounts must set their own password first
    public static array $permissions = [];  // delegated portal permissions
    private static ?string $lastResetToken = null;

    /** Debug-only helper: raw token of the most recent reset, never used in production mode. */
    public static function lastResetToken(): ?string
    {
        return self::$lastResetToken;
    }

    public static function boot(): void
    {
        $cookieName = (string) (self::$config['auth_session_cookie'] ?? 'fmsession');
        $token = (string) ($_COOKIE[$cookieName] ?? '');
        if ($token === '' || !ctype_xdigit($token) || strlen($token) !== 64) {
            return;
        }
        $row = Database::row(
            "SELECT u.id, u.email, u.username, u.approved, u.force_password_change, s.expires_at, s.token_hash
               FROM auth_sessions s JOIN app_users u ON u.id = s.user_id
              WHERE s.token_hash = ? LIMIT 1",
            [Tokens::hash($token)]
        );
        if (!$row) {
            return;
        }
        if (strtotime((string) $row['expires_at']) < time()) {
            Database::run('DELETE FROM auth_sessions WHERE token_hash = ?', [$row['token_hash']]);
            return;
        }
        self::$user = ['id' => $row['id'], 'email' => $row['email'], 'username' => $row['username'] ?? null];
        self::$approved = ((int) $row['approved']) === 1;
        self::$forcePasswordChange = ((int) ($row['force_password_change'] ?? 0)) === 1;
        Database::run('UPDATE auth_sessions SET last_used_at = UTC_TIMESTAMP() WHERE token_hash = ?', [$row['token_hash']]);

        self::$isAdmin = (bool) Database::row("SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role = 'admin'", [$row['id']]);
        self::$permissions = self::portalPermissions($row['id']);
        self::$resident = Database::row('SELECT * FROM residents WHERE user_id = ? LIMIT 1', [$row['id']]);
    }

    /** SECURITY DEFINER equivalents: is_admin() and portal_permissions(). */
    private static function portalPermissions(string $userId): array
    {
        $rows = Database::all(
            "SELECT DISTINCT prp.permission FROM portal_role_members m
              JOIN portal_roles r ON r.id = m.role_id
              JOIN portal_role_permissions prp ON prp.role_id = r.id
             WHERE m.user_id = ?",
            [$userId]
        );
        return array_map(fn ($r) => $r['permission'], $rows);
    }

    public static function requireLogin(): void
    {
        if (self::$user === null) {
            throw new ApiError(401, 'Please sign in');
        }
        if (!self::$approved) {
            throw new ApiError(403, 'Your account is awaiting admin verification');
        }
    }

    public static function requireAdmin(): void
    {
        self::requireLogin();
        if (!self::$isAdmin) {
            throw new ApiError(403, 'Admin only');
        }
    }

    /** Mirrors has_portal_permission(): full admins pass; delegated roles check their permission. */
    public static function can(string $permission): bool
    {
        self::requireLogin();
        return self::$isAdmin || in_array($permission, self::$permissions, true);
    }

    public static function requirePermission(string $permission): void
    {
        if (!self::can($permission)) {
            throw new ApiError(403, 'Not allowed: ' . $permission);
        }
    }

    /** Mirrors my_resident_id(). */
    public static function myResidentId(): ?string
    {
        return self::$resident['id'] ?? null;
    }

    /* ------------------------------------------------------------------ sessions */

    /** Accepts an e-mail address or a seeded username (e.g. "momin"). */
    private static function normaliseIdentifier(string $raw): string
    {
        $value = mb_strtolower(trim($raw));
        if ($value === '') {
            throw new ApiError(400, 'Enter your email or username');
        }
        if (filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return $value;
        }
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $value)) {
            throw new ApiError(400, 'Enter a valid email address or username');
        }
        return $value;
    }

    public static function login(string $email, string $password): array
    {
        $identifier = self::normaliseIdentifier($email);
        if ((string) $password === '') {
            throw new ApiError(400, 'Enter your password');
        }
        self::rateLimitLogin($identifier);

        $row = Database::row(
            'SELECT id, email, username, password_hash FROM app_users WHERE email = ? OR username = ? LIMIT 1',
            [$identifier, $identifier]
        );
        $ok = $row && password_verify((string) $password, (string) $row['password_hash']);
        Database::run('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)', [$identifier, Http::ip(), $ok ? 1 : 0]);
        if (!$ok) {
            // Uniform message: never disclose whether the account exists.
            throw new ApiError(401, 'Invalid email/username or password');
        }
        if (password_needs_rehash((string) $row['password_hash'], PASSWORD_DEFAULT)) {
            Database::run('UPDATE app_users SET password_hash = ? WHERE id = ?',
                [password_hash((string) $password, PASSWORD_DEFAULT), $row['id']]);
        }
        return self::openSession($row['id']);
    }

    /** Mirrors Postgres trigger handle_new_user(): first user becomes admin; resident match by email. */
    public static function signup(string $email, string $password, string $displayName): array    {
        $email = mb_strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(400, 'Enter a valid email address');
        }
        if (strlen((string) $password) < 8) {
            throw new ApiError(400, 'Password must be at least 8 characters');
        }
        if ($displayName === '' || mb_strlen($displayName) > 120) {
            throw new ApiError(400, 'Enter your name');
        }
        if (Database::row('SELECT id FROM app_users WHERE email = ?', [$email])) {
            throw new ApiError(409, 'This email is already registered');
        }

        Database::beginTransaction();
        try {
            $userId = Uuid::v4();
            // Pre-existing admin? Then this household is already running: new people wait for
            // admin verification. The very first account (no admin at all) is auto-approved admin.
            $anyAdmin = Database::row("SELECT 1 AS ok FROM user_roles WHERE role = 'admin' LIMIT 1");
            $approved = $anyAdmin ? 0 : 1;
            Database::run('INSERT INTO app_users (id, email, password_hash, approved) VALUES (?, ?, ?, ?)',
                [$userId, $email, password_hash((string) $password, PASSWORD_DEFAULT), $approved]);

            Database::run('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
                [Uuid::v4(), $userId, $anyAdmin ? 'resident' : 'admin']);

            $existing = Database::row('SELECT id FROM residents WHERE LOWER(email) = ? AND user_id IS NULL', [$email]);
            if ($existing) {
                Database::run('UPDATE residents SET user_id = ?, is_sample = 0 WHERE id = ?', [$userId, $existing['id']]);
            } else {
                Database::run('INSERT INTO residents (id, user_id, display_name, email) VALUES (?, ?, ?, ?)',
                    [Uuid::v4(), $userId, $displayName, $email]);
            }
            $session = self::openSession($userId);
            Database::run('INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
                [$userId, 'signup', 'user', $userId, json_encode(['email' => $email])]);
            Database::commit();
            return $session;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    private static function openSession(string $userId): array
    {
        $token = Tokens::generate();
        $days = max(1, (int) (self::$config['session_lifetime_days'] ?? 30));
        $expires = date('Y-m-d H:i:s', time() + $days * 86400);
        Database::run('INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_ip, user_agent) VALUES (?, ?, ?, ?, ?)',
            [Tokens::hash($token), $userId, $expires, Http::ip(), mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
        self::setSessionCookie($token, $days);
        return ['token' => $token, 'user_id' => $userId];
    }

    public static function setSessionCookie(string $token, int $days): void
    {
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        setcookie((string) (self::$config['auth_session_cookie'] ?? 'fmsession'), $token, [
            'expires' => time() + $days * 86400,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function logout(): void
    {
        $cookieName = (string) (self::$config['auth_session_cookie'] ?? 'fmsession');
        $token = (string) ($_COOKIE[$cookieName] ?? '');
        if ($token !== '' && ctype_xdigit($token) && strlen($token) === 64) {
            Database::run('DELETE FROM auth_sessions WHERE token_hash = ?', [Tokens::hash($token)]);
        }
        setcookie($cookieName, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    }

    public static function changePassword(string $current, string $new): void
    {
        self::requireLogin();
        if (strlen($new) < 8) {
            throw new ApiError(400, 'Use at least 8 characters');
        }
        $row = Database::row('SELECT password_hash FROM app_users WHERE id = ?', [self::$user['id']]);
        if (!$row || !password_verify($current, (string) $row['password_hash'])) {
            throw new ApiError(401, 'Current password is not correct');
        }
        Database::run('UPDATE app_users SET password_hash = ?, force_password_change = 0 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), self::$user['id']]);
        // Invalidate other sessions; keep the current one.
        $cookieName = (string) (self::$config['auth_session_cookie'] ?? 'fmsession');
        $token = (string) ($_COOKIE[$cookieName] ?? '');
        Database::run('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?', [self::$user['id'], Tokens::hash($token)]);
        Audit::log('change_password', 'user', self::$user['id']);
    }

    public static function changeEmail(string $newEmail, string $currentPassword): void
    {
        self::requireLogin();
        $newEmail = mb_strtolower(trim($newEmail));
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(400, 'Enter a valid email address');
        }
        $row = Database::row('SELECT password_hash FROM app_users WHERE id = ?', [self::$user['id']]);
        if (!$row || !password_verify($currentPassword, (string) $row['password_hash'])) {
            throw new ApiError(401, 'Current password is not correct');
        }
        if (Database::row('SELECT id FROM app_users WHERE email = ? AND id <> ?', [$newEmail, self::$user['id']])) {
            throw new ApiError(409, 'This email is already in use');
        }
        Database::run('UPDATE app_users SET email = ? WHERE id = ?', [$newEmail, self::$user['id']]);
        Database::run('UPDATE residents SET email = ? WHERE user_id = ?', [$newEmail, self::$user['id']]);
        Audit::log('change_email', 'user', self::$user['id'], ['email' => $newEmail]);
    }

    /* --------------------------------------------------------------- reset flow */

    /** Issues a reset token. Returns a status string; never discloses account existence to the caller. */
    public static function requestPasswordReset(string $email): string
    {
        self::$lastResetToken = null;
        $identifier = mb_strtolower(trim($email));
        $row = Database::row('SELECT id, email FROM app_users WHERE email = ? OR username = ? LIMIT 1', [$identifier, $identifier]);
        if (!$row) {
            return 'SENT';
        }
        $email = (string) $row['email'];
        $token = Tokens::generate();
        self::$lastResetToken = $token; // only surfaced when app_debug && mail disabled
        Database::run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [$row['id']]);
        Database::run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
            [Tokens::hash($token), $row['id'], date('Y-m-d H:i:s', time() + 3600)]);
        Audit::log('request_password_reset', 'user', $row['id']);
        if (!empty(self::$config['mail_enabled'])) {
            $base = self::originBase();
            $sent = @mail(
                $email,
                'FlatMate Hub password reset',
                "Reset your FlatMate Hub password:\r\n{$base}/reset-password?token={$token}\r\n\r\nThe link is valid for one hour.\r\n",
                'From: ' . (string) (self::$config['mail_from'] ?? 'no-reply@localhost') . "\r\nContent-Type: text/plain; charset=utf-8\r\n"
            );
            return $sent ? 'SENT' : 'MAIL_FAILED';
        }
        return 'MAIL_DISABLED';
    }

    public static function resetPassword(string $token, string $newPassword): void
    {
        if (strlen($newPassword) < 8) {
            throw new ApiError(400, 'Use at least 8 characters');
        }
        $row = Database::row(
            'SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            [Tokens::hash($token)]
        );
        if (!$row) {
            throw new ApiError(400, 'This reset link is invalid or has expired');
        }
        Database::beginTransaction();
        try {
            Database::run('UPDATE app_users SET password_hash = ? WHERE id = ?', [password_hash($newPassword, PASSWORD_DEFAULT), $row['user_id']]);
            Database::run('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE token_hash = ?', [Tokens::hash($token)]);
            Database::run('DELETE FROM auth_sessions WHERE user_id = ?', [$row['user_id']]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
        Audit::log('reset_password', 'user', $row['user_id']);
    }

    /* -------------------------------------------------------------- rate limits */

    private static function rateLimitLogin(string $email): void
    {
        $failures = Database::row(
            'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > (UTC_TIMESTAMP() - INTERVAL 15 MINUTE)',
            [$email]
        );
        if ($failures && (int) $failures['n'] >= 5) {
            throw new ApiError(429, 'Too many attempts. Wait 15 minutes and try again');
        }
        $ip = Http::ip();
        if ($ip !== 'unknown') {
            $byIp = Database::row(
                'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at > (UTC_TIMESTAMP() - INTERVAL 15 MINUTE)',
                [$ip]
            );
            if ($byIp && (int) $byIp['n'] >= 20) {
                throw new ApiError(429, 'Too many attempts. Wait 15 minutes and try again');
            }
        }
    }

    private static function originBase(): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return $scheme . '://' . $host;
    }
}
