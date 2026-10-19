<?php
declare(strict_types=1);

/** Shared authorization helpers mirroring Postgres policies/RPCs. */
final class Permissions
{
    /** expenses visible policy: admin OR created_by = me OR (group_id IS NULL OR in_group(group_id)). */
    public static function myGroupIds(): array
    {
        $rid = Auth::myResidentId();
        if (!$rid) {
            return [];
        }
        $rows = Database::all('SELECT group_id FROM group_members WHERE resident_id = ?', [$rid]);
        return array_map(fn ($r) => $r['group_id'], $rows);
    }

    public static function inGroup(?string $groupId): bool
    {
        if ($groupId === null) {
            return false;
        }
        $rid = Auth::myResidentId();
        return $rid !== null && (bool) Database::row(
            'SELECT 1 AS ok FROM group_members gm JOIN residents r ON r.id = gm.resident_id
              WHERE gm.group_id = ? AND r.user_id = ?',
            [$groupId, Auth::$user['id'] ?? '']
        );
    }
}
