<?php
declare(strict_types=1);

/** CSRF / cross-site guard for cookie-authenticated state-changing requests.
 *  Layered defense: SameSite=Lax session cookies + Origin verification on unsafe methods. */
final class Csrf
{
    public static function guard(array $config): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if ($host === '') {
            throw new ApiError(403, 'Cross-site request blocked');
        }
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '') {
            $parts = parse_url($origin);
            $originHost = $parts['host'] ?? '';
            $extraOrigins = array_filter(array_map('trim', explode(',', (string) ($config['cors_origins'] ?? ''))));
            if ($originHost === $host || in_array(rtrim($origin, '/'), $extraOrigins, true)) {
                return;
            }
            throw new ApiError(403, 'Cross-site request blocked');
        }
        // Same-origin posts without an Origin header must carry our custom header.
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
            throw new ApiError(403, 'Missing CSRF verification');
        }
    }
}
