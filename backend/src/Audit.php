<?php
declare(strict_types=1);

/** Audit trail — replaces the public.log_audit() SECURITY DEFINER function. */
final class Audit
{
    public static function log(string $action, string $entity, ?string $entityId, array $details = []): void
    {
        try {
            Database::run(
                'INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
                [Auth::$user['id'] ?? null, $action, $entity, $entityId, json_encode($details, JSON_UNESCAPED_UNICODE) ?: '{}']
            );
        } catch (Throwable) {
            // Audit must never break the primary operation; failures go to the server error log.
            error_log('[FlatMate audit] failed to record ' . $action);
        }
    }
}
