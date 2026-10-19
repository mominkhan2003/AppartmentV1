<?php
declare(strict_types=1);

/**
 * Hub pages (shopping/notices/events/bookings/polls/inventory/documents/contacts/rules/lost-found).
 * Direct port of hub_respond / hub_set_status / hub_edit_item + the hub_item_guard trigger rules,
 * including booking conflict detection (Postgres advisory lock -> MySQL named GET_LOCK).
 */
final class Hub
{
    public const KINDS = ['shopping', 'notices', 'events', 'bookings', 'polls', 'inventory', 'documents', 'contacts', 'rules', 'lost-found'];

    /** Validates the payload exactly like hub_item_guard did. */
    private static function guardPayload(string $kind, ?array $payload, ?string $itemId): void
    {
        if ($payload === null) {
            $payload = [];
        }
        if ($kind === 'bookings') {
            $start = (string) ($payload['start'] ?? '');
            $end = (string) ($payload['end'] ?? '');
            if ($start === '' || $end === '' || trim((string) ($payload['resource'] ?? '')) === '') {
                throw new ApiError(400, 'Choose a resource and an end time after the start');
            }
            $s = strtotime($start);
            $e = strtotime($end);
            if ($s === false || $e === false || $e <= $s) {
                throw new ApiError(400, 'Choose a resource and an end time after the start');
            }
            $resource = mb_strtolower(trim((string) $payload['resource']));
            Database::run('SELECT GET_LOCK(?, 5)', ['fm_booking_' . hex2bin(substr(md5($resource), 0, 8))]);
            try {
                $conflict = Database::row(
                    "SELECT id FROM hub_items
                      WHERE kind = 'bookings' AND status = 'open' AND id <> IFNULL(?, '')
                        AND LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.resource')))) = ?
                        AND JSON_EXTRACT(payload, '$.start') < ? AND JSON_EXTRACT(payload, '$.end') > ?",
                    [$itemId, $resource, self::mysqlTimestampIso($end), self::mysqlTimestampIso($start)]
                );
                if ($conflict) {
                    throw new ApiError(409, 'This resource is already booked during that time');
                }
            } finally {
                Database::run('SELECT RELEASE_LOCK(?)', ['fm_booking_' . hex2bin(substr(md5($resource), 0, 8))]);
            }
        }
        if ($kind === 'polls') {
            $options = $payload['options'] ?? null;
            if (!is_array($options) || count($options) < 2 || count($options) > 6) {
                throw new ApiError(400, 'Polls need two to six options');
            }
            foreach ($options as $option) {
                if (!is_string($option) || trim($option) === '') {
                    throw new ApiError(400, 'Polls need two to six options');
                }
            }
        }
    }

    private static function mysqlTimestampIso(string $value): string
    {
        $t = strtotime($value);
        return $t === false ? $value : gmdate('Y-m-d H:i:s', $t);
    }

    /** Collective insert: mirrors hub_create policy (notices/rules/contacts/documents = admin) + guard. */
    public static function insertItem(array $body): string
    {
        Auth::requireLogin();
        $kind = Req::enum($body, 'kind', self::KINDS, true);
        $title = Req::text($body, 'title', 160, true);
        $details = Req::text($body, 'details', 2000) ?? '';
        $payload = is_array($body['payload'] ?? null) ? (array) $body['payload'] : [];
        self::guardPayload((string) $kind, $payload, null);
        $adminOnly = in_array($kind, ['notices', 'rules', 'contacts', 'documents'], true);
        if ($adminOnly && !Auth::$isAdmin) {
            throw new ApiError(403, 'Admin only');
        }
        $id = Uuid::v4();
        Database::run(
            'INSERT INTO hub_items (id, kind, title, details, payload, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$id, $kind, $title, $details, json_encode($payload, JSON_UNESCAPED_UNICODE) ?: '{}', 'open', Auth::$user['id']]
        );
        return $id;
    }

    /** Mirrors hub_edit_item: author or admin; poll options frozen once votes exist. */
    public static function editItem(string $itemId, array $body): void
    {
        Auth::requireLogin();
        $title = Req::text($body, 'title', 160, true);
        $details = Req::text($body, 'details', 2000) ?? '';
        $payload = is_array($body['payload'] ?? null) ? (array) $body['payload'] : [];
        Database::beginTransaction();
        try {
            $item = Database::row('SELECT * FROM hub_items WHERE id = ? FOR UPDATE', [$itemId]);
            if (!$item) {
                throw new ApiError(404, 'Item not found');
            }
            if (!Auth::$isAdmin && $item['created_by'] !== Auth::$user['id']) {
                throw new ApiError(403, 'Only the author or administrator can edit this');
            }
            if ($item['kind'] === 'polls') {
                $hasVotes = (bool) Database::row('SELECT 1 AS ok FROM hub_responses WHERE item_id = ?', [$itemId]);
                $oldOptions = json_decode((string) $item['payload'], true)['options'] ?? [];
                $newOptions = $payload['options'] ?? [];
                if ($hasVotes && $oldOptions !== $newOptions) {
                    throw new ApiError(400, 'Poll options cannot change after voting starts');
                }
            }
            self::guardPayload((string) $item['kind'], $payload, $itemId);
            Database::run('UPDATE hub_items SET title = ?, details = ?, payload = ? WHERE id = ?',
                [$title, $details, json_encode($payload, JSON_UNESCAPED_UNICODE) ?: '{}', $itemId]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function deleteItem(string $itemId): void
    {
        Auth::requireLogin();
        $item = Database::row('SELECT * FROM hub_items WHERE id = ?', [$itemId]);
        if (!$item) {
            throw new ApiError(404, 'Item not found');
        }
        if (!Auth::$isAdmin && $item['created_by'] !== Auth::$user['id']) {
            throw new ApiError(403, 'Only the author or administrator can delete this');
        }
        Database::run('DELETE FROM hub_items WHERE id = ?', [$itemId]);
    }

    /** Mirrors hub_respond. */
    public static function respond(string $itemId, string $value): void
    {
        Auth::requireLogin();
        if ($value === '') {
            throw new ApiError(400, 'Choose a response');
        }
        Database::beginTransaction();
        try {
            $item = Database::row('SELECT * FROM hub_items WHERE id = ? FOR UPDATE', [$itemId]);
            if (!$item) {
                throw new ApiError(404, 'Item not found');
            }
            if ($item['status'] === 'done') {
                throw new ApiError(400, 'This item is closed');
            }
            $kind = (string) $item['kind'];
            $payload = json_decode((string) $item['payload'], true) ?: [];
            if ($kind === 'polls') {
                if (!in_array($value, (array) ($payload['options'] ?? []), true)) {
                    throw new ApiError(400, 'Choose a valid poll option');
                }
            } elseif ($kind === 'events') {
                if (!in_array($value, ['going', 'maybe', 'not-going'], true)) {
                    throw new ApiError(400, 'Choose a valid response');
                }
            } elseif ($kind === 'notices' || $kind === 'rules') {
                if ($value !== 'acknowledged') {
                    throw new ApiError(400, 'Invalid acknowledgement');
                }
            } elseif ($kind === 'inventory' || $kind === 'lost-found') {
                if ($value === 'release') {
                    if (!Auth::$isAdmin
                        && !Database::row('SELECT 1 AS ok FROM hub_responses WHERE item_id = ? AND user_id = ?', [$itemId, Auth::$user['id']])) {
                        throw new ApiError(403, 'Only the borrower or admin can release this');
                    }
                    Database::run('DELETE FROM hub_responses WHERE item_id = ?', [$itemId]);
                    Database::commit();
                    return;
                }
                if ($value !== 'claimed') {
                    throw new ApiError(400, 'Invalid claim');
                }
                if (Database::row('SELECT 1 AS ok FROM hub_responses WHERE item_id = ?', [$itemId])) {
                    throw new ApiError(409, 'This item is already claimed');
                }
            } else {
                throw new ApiError(400, 'This item does not accept responses');
            }
            Database::run(
                'INSERT INTO hub_responses (item_id, user_id, value) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), created_at = UTC_TIMESTAMP()',
                [$itemId, Auth::$user['id'], $value]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    /** Mirrors hub_set_status. */
    public static function setStatus(string $itemId, string $status): void
    {
        Auth::requireLogin();
        if (!in_array($status, ['open', 'done'], true)) {
            throw new ApiError(400, 'Invalid status');
        }
        Database::beginTransaction();
        try {
            $item = Database::row('SELECT * FROM hub_items WHERE id = ? FOR UPDATE', [$itemId]);
            if (!$item) {
                throw new ApiError(404, 'Item not found');
            }
            if ($item['kind'] !== 'shopping' && !Auth::$isAdmin && $item['created_by'] !== Auth::$user['id']) {
                throw new ApiError(403, 'Only the author or administrator can close this');
            }
            Database::run('UPDATE hub_items SET status = ? WHERE id = ?', [$status, $itemId]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }
}
