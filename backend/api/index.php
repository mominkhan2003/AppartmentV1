<?php
declare(strict_types=1);

/**
 * FlatMate Hub API — single front controller. Deployed on cPanel under public_html/api/.
 * The command `php -S 127.0.0.1:8010 api/index.php` runs this during development/testing.
 *
 * Security model:
 *  - Session cookie (HttpOnly, SameSite=Lax) issued by backend/src/Auth.php
 *  - CSRF guard on unsafe methods (backend/src/Csrf.php)
 *  - Every endpoint enforces the authorization rules that Postgres RLS/RPCs used to enforce;
 *    authorization NEVER relies on the frontend hiding UI.
 *  - All SQL uses prepared statements (see backend/src/Database.php).
 *  - No database credentials are returned by any response.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
date_default_timezone_set('UTC');

set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Http.php';
require __DIR__ . '/../src/Uuid.php';
require __DIR__ . '/../src/Audit.php';
require __DIR__ . '/../src/Auth.php';
require __DIR__ . '/../src/Csrf.php';
require __DIR__ . '/../src/Media.php';
require __DIR__ . '/../src/Permissions.php';
require __DIR__ . '/../src/Repositories.php';
require __DIR__ . '/../src/Services.php';
require __DIR__ . '/routes.php';

$config = require __DIR__ . '/../config/bootstrap.php';
$config = array_merge([
    'session_lifetime_days' => 30,
    'default_locale' => 'en',
    'timezone' => 'Europe/Vienna',
    'uploads_dir' => null,
    'cors_origins' => '',
    'mail_enabled' => false,
    'mail_from' => 'no-reply@localhost',
    'app_debug' => false,
    'auth_session_cookie' => 'fmsession',
], is_array($config) ? $config : []);

Database::configure($config);
Media::configure($config);
Auth::configure($config);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

/* ---------------------------------------------------------------- dispatch */

final class Router
{
    /** @return array{0:array,1:array<string,string>} */
    public static function resolve(string $method, string $path): array
    {
        // Strip deployment prefixes: the directory containing index.php, then a literal /api.
        $scriptDir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
        foreach ([$scriptDir, '/api', '/index.php'] as $prefix) {
            if ($prefix !== '/' && $prefix !== '' && str_starts_with($path, $prefix)) {
                $path = substr($path, strlen($prefix));
                break;
            }
        }
        $path = '/' . trim($path, '/');
        $segments = array_values(array_filter(explode('/', $path), fn ($s) => $s !== ''));
        if (!$segments) {
            throw new ApiError(404, 'Not found');
        }
        foreach (Routes::all() as $candidate) {
            if ($candidate['method'] !== $method || count($candidate['segments']) !== count($segments)) {
                continue;
            }
            $params = [];
            $ok = true;
            foreach ($candidate['segments'] as $i => $seg) {
                if (str_starts_with($seg, ':')) {
                    $params[substr($seg, 1)] = rawurldecode($segments[$i]);
                } elseif ($seg !== $segments[$i]) {
                    $ok = false;
                    break;
                }
            }
            if ($ok) {
                return [$candidate, $params];
            }
        }
        throw new ApiError(404, 'Not found');
    }
}

try {
    Csrf::guard($config);
    Auth::boot();
    [$route, $params] = Router::resolve($_SERVER['REQUEST_METHOD'] ?? 'GET', str_replace('\\', '/', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'));
    ($route['handler'])($params, $_GET, $config);
} catch (ApiError $e) {
    Http::error($e->status, $e->getMessage());
} catch (Throwable $e) {
    error_log('[FlatMate API] unexpected ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Http::error(500, 'Unexpected server error. Check the PHP error log for details.');
}
