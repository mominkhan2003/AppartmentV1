<?php
declare(strict_types=1);

/** Thrown with a HTTP status and a user-facing English message (mirrors PostgREST error style the UI already toasts). */
final class ApiError extends Exception
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

final class Http
{
    /** @param array<string,mixed> $data */
    public static function json(int $status, array $data): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            $payload = '{"error":"Internal encoding error"}';
        }
        echo $payload;
        exit;
    }

    public static function error(int $status, string $message): never
    {
        self::json($status, ['error' => $message]);
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input');
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new ApiError(400, 'Invalid JSON body');
        }
        return $decoded;
    }

    public static function formOrJson(): array
    {
        $ct = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($ct, 'application/json')) {
            return self::body();
        }
        return $_POST;
    }

    public static function segment(array $m, int $position): string
    {
        return (string) ($m[$position] ?? '');
    }

    public static function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if (str_contains($ip, ':')) {
            $ip = explode(':', $ip)[0]; // IPv6-mapped IPv4 in tests/proxies
        }
        return self::cleanIp($ip);
    }

    public static function cleanIp(string $ip): string
    {
        $clean = filter_var(trim($ip), FILTER_VALIDATE_IP);
        return $clean === false ? 'unknown' : $clean;
    }
}

/** Request guard helpers */
final class Req
{
    public static function requireMethod(string $method, array $pathMatch): void
    {
        if (($pathMatch['method'] ?? '') !== $method) {
            throw new ApiError(405, 'Method not allowed');
        }
    }

    /** Trims and returns a string field, with length validation. */
    public static function text(array $body, string $key, ?int $max = null, bool $required = false): ?string
    {
        $value = isset($body[$key]) && is_string($body[$key]) ? trim($body[$key]) : '';
        if ($required && $value === '') {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
        }
        if ($max !== null && mb_strlen($value) > $max) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . " must be at most {$max} characters");
        }
        return $value === '' && !$required ? null : $value;
    }

    public static function int(array $body, string $key, bool $required = false): ?int
    {
        if (!isset($body[$key]) || $body[$key] === '' || $body[$key] === null) {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        $v = filter_var((string) $body[$key], FILTER_VALIDATE_INT);
        if ($v === false) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' must be a whole number');
        }
        return $v;
    }

    public static function positiveInt(array $body, string $key, bool $required = false): ?int
    {
        $v = self::int($body, $key, $required);
        if ($v !== null && $v <= 0) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' must be positive');
        }
        return $v;
    }

    public static function centsFrom(array $body, string $key, bool $required = false): ?int
    {
        if (!isset($body[$key]) || $body[$key] === '' || $body[$key] === null) {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        if (is_int($body[$key])) {
            return self::positiveInt($body, $key, true);
        }
        $normalized = str_replace(',', '.', str_replace(' ', '', (string) $body[$key]));
        if (!is_numeric($normalized)) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' must be a valid amount');
        }
        $cents = (int) round((float) $normalized * 100);
        if ($cents <= 0) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' must be positive');
        }
        return $cents;
    }

    /** Validates 'YYYY-MM-DD'; null when absent. */
    public static function date(array $body, string $key, bool $required = false): ?string
    {
        $value = isset($body[$key]) && is_string($body[$key]) ? trim($body[$key]) : '';
        if ($value === '') {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        $d = DateTime::createFromFormat('Y-m-d', $value);
        if (!$d || $d->format('Y-m-d') !== $value) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' must be a date (YYYY-MM-DD)');
        }
        return $value;
    }

    /** Validates local input (datetime-local) or ISO; stores UTC 'Y-m-d H:i:s'; null when absent. */
    public static function utc(array $body, string $key, bool $required = false): ?string
    {
        $value = isset($body[$key]) && is_string($body[$key]) ? trim($body[$key]) : '';
        if ($value === '') {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        $formats = ['Y-m-d\TH:i', 'Y-m-d\TH:i:sP', 'Y-m-d\TH:i:s', 'Y-m-d\TH:i:s.uP', 'Y-m-d H:i:s'];
        foreach ($formats as $fmt) {
            $d = DateTime::createFromFormat($fmt, $value);
            if ($d && $d->format($fmt) === $value) {
                $d->setTimezone(new DateTimeZone('UTC'));
                return $d->format('Y-m-d H:i:s');
            }
        }
        throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is not a valid date/time');
    }

    public static function uuid(array $body, string $key, bool $required = false): ?string
    {
        $value = isset($body[$key]) && is_string($body[$key]) ? trim($body[$key]) : '';
        if ($value === '') {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        if (!Uuid::isValid($value)) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is not a valid identifier');
        }
        return $value;
    }

    /** Returns one of the allowed enum values, or null when absent (required => error). */
    public static function enum(array $body, string $key, array $allowed, bool $required = false): ?string
    {
        $value = isset($body[$key]) && is_string($body[$key]) ? trim($body[$key]) : '';
        if ($value === '') {
            if ($required) {
                throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . ' is required');
            }
            return null;
        }
        if (!in_array($value, $allowed, true)) {
            throw new ApiError(400, ucfirst(str_replace('_', ' ', $key)) . " must be one of: " . implode(', ', array_values($allowed)));
        }
        return $value;
    }

    public static function bool(array $body, string $key): bool
    {
        return !empty($body[$key]) && $body[$key] !== 'false' && $body[$key] !== '0';
    }
}
