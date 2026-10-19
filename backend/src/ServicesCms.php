<?php
declare(strict_types=1);

/**
 * CMS domain services: events + shifts, homepage site content, donations, social post studio.
 * These back the new admin capabilities while keeping the existing homepage's design unmodified.
 */
final class ServicesCms
{
    /* --------------------------------------------------------------- events */

    private static function slugify(string $text): string
    {
        $text = mb_strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
        $text = trim($text, '-');
        return $text === '' ? 'event' : mb_substr($text, 0, 100);
    }

    private static function uniqueSlug(string $base, ?string $exceptId = null): string
    {
        $slug = $base;
        for ($i = 0; $i < 50; $i++) {
            $row = $exceptId !== null
                ? Database::row('SELECT id FROM events WHERE slug = ? AND id <> ?', [$slug, $exceptId])
                : Database::row('SELECT id FROM events WHERE slug = ?', [$slug]);
            if (!$row) {
                return $slug;
            }
            $slug = $base . '-' . ($i + 2);
        }
        return $base . '-' . substr(Uuid::v4(), 0, 8);
    }

    public static function eventPayload(array $row): array
    {
        $translations = Database::all('SELECT locale, title, description FROM event_translations WHERE event_id = ?', [$row['id']]);
        $gallery = Database::all(
            'SELECT g.media_id, g.sort, m.alt_text, m.caption FROM event_gallery g JOIN media_assets m ON m.id = g.media_id
              WHERE g.event_id = ? ORDER BY g.sort',
            [$row['id']]
        );
        $shifts = self::eventShifts((string) $row['id']);
        $row['translations'] = $translations;
        $row['gallery'] = $gallery;
        $row['shifts'] = $shifts;
        return $row;
    }

    public static function eventShifts(string $eventId): array
    {
        $shifts = Database::all('SELECT * FROM event_shifts WHERE event_id = ? ORDER BY starts_at', [$eventId]);
        foreach ($shifts as &$s) {
            $assign = Database::all(
                'SELECT sa.*, r.display_name FROM shift_assignments sa JOIN residents r ON r.id = sa.resident_id
                  WHERE sa.shift_id = ? ORDER BY r.display_name',
                [$s['id']]
            );
            $s['assignments'] = array_map(fn ($a) => $a, $assign);
            $s['confirmed_count'] = count(array_filter($assign, fn ($a) => $a['status'] === 'confirmed'));
            $s['planned_count'] = count(array_filter($assign, fn ($a) => $a['status'] !== 'declined'));
        }
        return $shifts;
    }

    public static function saveEvent(?string $id, array $body): array
    {
        Auth::requireAdmin();
        $startsWith = Req::utc($body, 'starts_at', true);
        $endsAt = Req::utc($body, 'ends_at');
        if ($startsAt !== null && $endsAt !== null && strcmp($startsAt, $endsAt) >= 0) {
            throw new ApiError(400, 'The end time must be after the start time');
        }
        $status = Req::enum($body, 'status', ['draft', 'published', 'archived']) ?? 'draft';
        $category = Req::enum($body, 'category', ['community', 'cooking', 'organizing', 'cleaning', 'other']) ?? 'other';
        $coverMediaId = Req::uuid($body, 'cover_media_id');
        $translationsIn = self::translationsFrom($body);
        if (!$translationsIn) {
            throw new ApiError(400, 'Provide at least one title (de or en)');
        }
        $gallery = is_array($body['gallery'] ?? null) ? array_values((array) $body['gallery']) : null;

        Database::beginTransaction();
        try {
            if ($coverMediaId !== null && !Media::row($coverMediaId)) {
                throw new ApiError(400, 'Cover image not found in the media library');
            }
            $firstTitle = '';
            foreach ($translationsIn as $t) {
                if (trim((string) ($t['title'] ?? '')) !== '') {
                    $firstTitle = (string) $t['title'];
                    break;
                }
            }
            if ($id === null) {
                $id = Uuid::v4();
                $slug = self::uniqueSlug(self::slugify($firstTitle));
                Database::run(
                    'INSERT INTO events (id, slug, status, category, starts_at, ends_at, timezone, meeting_point, address,
                          cover_media_id, additional_info, published_at, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, $slug, $status, $category, $startsAt, $endsAt, Req::text($body, 'timezone', 64) ?? 'Europe/Vienna',
                     Req::text($body, 'meeting_point', 255), Req::text($body, 'address', 255), $coverMediaId,
                     Req::text($body, 'additional_info', 2000), $status === 'published' ? date('Y-m-d H:i:s') : null, Auth::$user['id']]
                );
            } else {
                $row = Database::row('SELECT * FROM events WHERE id = ? FOR UPDATE', [$id]);
                if (!$row) {
                    throw new ApiError(404, 'Event not found');
                }
                $wasPublished = $row['status'] === 'published';
                $slug = self::uniqueSlug(self::slugify($firstTitle), $id);
                Database::run(
                    'UPDATE events SET status = ?, category = ?, starts_at = ?, ends_at = ?, timezone = ?, meeting_point = ?,
                          address = ?, cover_media_id = ?, additional_info = ?, published_at = ? WHERE id = ?',
                    [$status, $category, $startsAt, $endsAt, Req::text($body, 'timezone', 64) ?? $row['timezone'],
                     Req::text($body, 'meeting_point', 255), Req::text($body, 'address', 255), $coverMediaId,
                     Req::text($body, 'additional_info', 2000),
                     $status === 'published' ? ($wasPublished ? $row['published_at'] : date('Y-m-d H:i:s')) : null, $id]
                );
            }
            foreach ($translationsIn as $locale => $t) {
                Database::run(
                    'INSERT INTO event_translations (event_id, locale, title, description) VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)',
                    [$id, (string) $locale, (string) ($t['title'] ?? 'Untitled') , $t['description'] ?? null]
                );
            }
            if ($gallery !== null) {
                Database::run('DELETE FROM event_gallery WHERE event_id = ?', [$id]);
                foreach ($gallery as $sort => $mediaId) {
                    if (!Uuid::isValid((string) $mediaId)) {
                        throw new ApiError(400, 'Gallery contains an invalid media id');
                    }
                    if (!Media::row((string) $mediaId)) {
                        throw new ApiError(400, 'Gallery image not found in the media library');
                    }
                    Database::run('INSERT INTO event_gallery (event_id, media_id, sort) VALUES (?, ?, ?)',
                        [$id, (string) $mediaId, (int) $sort]);
                }
            }
            Audit::log($id ? 'update_event' : 'create_event', 'event', $id, ['status' => $status]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
        return self::eventPayload(Database::row('SELECT * FROM events WHERE id = ?', [$id]) ?? []);
    }

    private static function translationsFrom(array $body): array
    {
        $out = [];
        foreach (['de', 'en'] as $locale) {
            $t = $body[$locale] ?? null;
            if (is_array($t) && isset($t['title']) && trim((string) $t['title']) !== '') {
                $out[$locale] = [
                    'title' => mb_substr(trim((string) $t['title']), 0, 200),
                    'description' => isset($t['description']) ? mb_substr(trim((string) $t['description']), 0, 2000) : null,
                ];
            }
        }
        return $out;
    }

    public static function duplicateEvent(string $id): array
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM events WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Event not found');
        }
        Database::beginTransaction();
        try {
            $newId = Uuid::v4();
            $translations = Database::all('SELECT locale, title, description FROM event_translations WHERE event_id = ?', [$id]);
            $title = (string) ($translations[0]['title'] ?? 'Event');
            $slug = self::uniqueSlug(self::slugify($title . ' copy'));
            Database::run(
                'INSERT INTO events (id, slug, status, category, starts_at, ends_at, timezone, meeting_point, address,
                      cover_media_id, additional_info, created_by)
                 VALUES (?, ?, ?, ?, DATE_ADD(?, INTERVAL 1 MONTH), ?, ?, ?, ?, ?, ?, ?)',
                [$newId, $slug, 'draft', $row['category'], $row['starts_at'], $row['ends_at'], $row['timezone'],
                 $row['meeting_point'], $row['address'], $row['cover_media_id'], $row['additional_info'], Auth::$user['id']]
            );
            foreach ($translations as $t) {
                Database::run('INSERT INTO event_translations (event_id, locale, title, description) VALUES (?, ?, ?, ?)',
                    [$newId, $t['locale'], $t['title'], $t['description']]);
            }
            Database::run(
                'INSERT INTO event_shifts (id, event_id, name, starts_at, ends_at, slots, notes)
                 SELECT UUID(), ?, name, DATE_ADD(starts_at, INTERVAL 1 MONTH), ends_at, slots, notes FROM event_shifts WHERE event_id = ?',
                [$newId, $id]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
        Audit::log('duplicate_event', 'event', $newId, ['from' => $id]);
        return self::eventPayload(Database::row('SELECT * FROM events WHERE id = ?', [$newId]) ?? []);
    }

    public static function transitionEvent(string $id, string $status): array
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM events WHERE id = ? FOR UPDATE', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Event not found');
        }
        $publishedAt = $row['published_at'];
        if ($status === 'published' && $publishedAt === null) {
            $publishedAt = date('Y-m-d H:i:s');
        }
        Database::run('UPDATE events SET status = ?, published_at = ? WHERE id = ?', [$status, $publishedAt, $id]);
        Audit::log('update_event_status', 'event', $id, ['status' => $status]);
        return self::eventPayload(Database::row('SELECT * FROM events WHERE id = ?', [$id]) ?? []);
    }

    public static function deleteEvent(string $id): void
    {
        Auth::requireAdmin();
        if (!Database::row('SELECT id FROM events WHERE id = ?', [$id])) {
            throw new ApiError(404, 'Event not found');
        }
        Database::run('DELETE FROM events WHERE id = ?', [$id]);
        Audit::log('delete_event', 'event', $id);
    }

    public static function listEvents(array $query): array
    {
        Auth::requireAdmin();
        $status = trim((string) ($query['status'] ?? ''));
        $search = trim((string) ($query['q'] ?? ''));
        $page = max(1, (int) ($query['page'] ?? 1));
        $perPage = min(50, max(5, (int) ($query['per_page'] ?? 12)));
        $where = []; $params = [];
        if (in_array($status, ['draft', 'published', 'archived'], true)) {
            $where[] = 'status = ?'; $params[] = $status;
        }
        if ($search !== '') {
            $where[] = '(slug LIKE ? OR id IN (SELECT event_id FROM event_translations WHERE title LIKE ?))';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%';
            array_push($params, $like, $like);
        }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $total = (int) (Database::row('SELECT COUNT(*) AS n FROM events' . $whereSql, $params)['n'] ?? 0);
        $offset = ($page - 1) * $perPage;
        $rows = Database::all('SELECT * FROM events' . $whereSql . " ORDER BY starts_at DESC LIMIT $perPage OFFSET $offset", $params);
        $items = [];
        foreach ($rows as $row) {
            $items[] = self::eventPayload($row);
        }
        return ['items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }

    /* --------------------------------------------------------------- shifts */

    public static function saveShift(?string $id, array $body): string
    {
        Auth::requireAdmin();
        $eventId = Req::uuid($body, 'event_id', true);
        if (!Database::row('SELECT id FROM events WHERE id = ?', [$eventId])) {
            throw new ApiError(404, 'Event not found');
        }
        $name = Req::text($body, 'name', 120, true);
        $startsAt = Req::utc($body, 'starts_at', true);
        $endsAt = Req::utc($body, 'ends_at');
        if ($startsAt !== null && $endsAt !== null && strcmp($startsAt, $endsAt) >= 0) {
            throw new ApiError(400, 'The end time must be after the start time');
        }
        $slots = max(1, Req::int($body, 'slots') ?? 1);
        if ($id === null) {
            $id = Uuid::v4();
            Database::run('INSERT INTO event_shifts (id, event_id, name, starts_at, ends_at, slots, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$id, $eventId, $name, $startsAt, $endsAt, $slots, Req::text($body, 'notes', 500)]);
        } else {
            if (!Database::row('SELECT id FROM event_shifts WHERE id = ?', [$id])) {
                throw new ApiError(404, 'Shift not found');
            }
            Database::run('UPDATE event_shifts SET name = ?, starts_at = ?, ends_at = ?, slots = ?, notes = ? WHERE id = ?',
                [$name, $startsAt, $endsAt, $slots, Req::text($body, 'notes', 500), $id]);
        }
        Audit::log($id ? 'update_shift' : 'create_shift', 'shift', $id, ['event_id' => $eventId, 'name' => $name]);
        return $id;
    }

    public static function deleteShift(string $id): void
    {
        Auth::requireAdmin();
        Database::run('DELETE FROM event_shifts WHERE id = ?', [$id]);
        Audit::log('delete_shift', 'shift', $id);
    }

    public static function assignShift(string $shiftId, array $body): array
    {
        Auth::requireAdmin();
        $shift = Database::row('SELECT * FROM event_shifts WHERE id = ? FOR UPDATE', [$shiftId]);
        if (!$shift) {
            throw new ApiError(404, 'Shift not found');
        }
        $residentId = Req::uuid($body, 'resident_id', true);
        $status = Req::enum($body, 'status', ['planned', 'confirmed', 'declined']) ?? 'planned';
        if ($status !== 'declined') {
            // Slot constraint: planned+confirmed people must fit into the slot count.
            $others = Database::row(
                "SELECT COUNT(*) AS n FROM shift_assignments WHERE shift_id = ? AND status <> 'declined' AND resident_id <> ?",
                [$shiftId, $residentId]
            );
            if ((int) $others['n'] >= (int) $shift['slots']) {
                throw new ApiError(409, 'All slots of this shift are already taken');
            }
        }
        Database::run(
            'INSERT INTO shift_assignments (shift_id, resident_id, status, note, created_by) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), created_by = VALUES(created_by)',
            [$shiftId, $residentId, $status, Req::text($body, 'note', 300), Auth::$user['id']]
        );
        Audit::log('assign_shift', 'shift', $shiftId, ['resident_id' => $residentId, 'status' => $status]);
        return Database::all('SELECT * FROM shift_assignments WHERE shift_id = ?', [$shiftId]);
    }

    public static function declineShift(string $shiftId): void
    {
        Auth::requireLogin();
        $me = Auth::myResidentId();
        if ($me === null) {
            throw new ApiError(403, 'Only residents can decline a shift');
        }
        Database::run(
            "UPDATE shift_assignments SET status = 'declined', note = CONCAT(note, ' [declined by resident]') WHERE shift_id = ? AND resident_id = ?",
            [$shiftId, $me]
        );
    }
}
