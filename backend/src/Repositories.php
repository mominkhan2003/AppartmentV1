<?php
declare(strict_types=1);

/**
 * Read-model queries shared by multiple endpoints.
 * These mirror the PostgREST selects the frontend used before; authorization filters are applied
 * in PHP (replacing Postgres RLS) whenever the caller is not an administrator.
 */
final class Repositories
{
    public static function me(): array
    {
        if (Auth::$user === null) {
            Http::error(401, 'Please sign in');
        }
        return [
            'user' => [
                'id' => Auth::$user['id'],
                'email' => Auth::$user['email'],
            ],
            'isAdmin' => Auth::$isAdmin,
            'permissions' => Auth::$permissions,
            'resident' => Auth::$resident,
        ];
    }

    public static function spaces(): array
    {
        return Database::all('SELECT id, code, name, kind, shape, capacity, notes, sort, created_at FROM spaces ORDER BY sort, code');
    }

    public static function residents(): array
    {
        return Database::all('SELECT * FROM residents ORDER BY display_name');
    }

    public static function groupsWithMembers(): array
    {
        $groups = Database::all('SELECT * FROM household_groups ORDER BY name');
        $members = Database::all('SELECT group_id, resident_id FROM group_members');
        foreach ($groups as &$g) {
            $g['members'] = array_values(array_filter($members, fn ($m) => $m['group_id'] === $g['id']));
            $g['members'] = array_map(fn ($m) => $m['resident_id'], $g['members']);
        }
        return $groups;
    }

    public static function washroomAccess(): array
    {
        return Database::all('SELECT washroom_id, bedroom_id FROM washroom_access');
    }

    public static function residentBalances(): array
    {
        Auth::requireLogin();
        if (Auth::$isAdmin) {
            return Database::all('SELECT * FROM resident_balances ORDER BY resident_id');
        }
        // security_invoker behaviour: a resident only sees their own aggregate.
        $rid = Auth::myResidentId();
        if (!$rid) {
            return [];
        }
        return Database::all('SELECT * FROM resident_balances WHERE resident_id = ?', [$rid]);
    }

    /** Authenticated expense list: mirrors RLS "expenses visible" (admin / own / groupless / member-of-group). */
    public static function expensesOverview(): array
    {
        Auth::requireLogin();
        $params = [];
        if (Auth::$isAdmin) {
            $where = '';
        } else {
            $myGroups = Permissions::myGroupIds();
            $conditions = ['e.created_by = ?', 'e.group_id IS NULL'];
            $params[] = Auth::$user['id'];
            if ($myGroups) {
                $in = implode(',', array_fill(0, count($myGroups), '?'));
                $conditions[] = "e.group_id IN ($in)";
                array_push($params, ...$myGroups);
            }
            $where = ' WHERE (' . implode(' OR ', $conditions) . ')';
        }
        return Database::all(
            "SELECT e.*, ra.file_path AS receipt_file_path, ra.mime_type AS receipt_mime
               FROM expenses e LEFT JOIN media_assets ra ON ra.id = e.receipt_media_id
              $where
              ORDER BY e.expense_date DESC, e.created_at DESC",
            $params
        );
    }

    /** Authenticated share listing: mirrors the "shares visible" policy in one clean statement. */
    public static function expenseShares(): array
    {
        Auth::requireLogin();
        if (Auth::$isAdmin) {
            return Database::all('SELECT * FROM expense_shares');
        }
        $myGroups = Permissions::myGroupIds();
        $params = [Auth::myResidentId() ?: '', Auth::$user['id']];
        $sql = 'SELECT es.* FROM expense_shares es JOIN expenses e ON e.id = es.expense_id
                 WHERE es.resident_id = ? OR e.created_by = ? OR e.group_id IS NULL';
        if ($myGroups) {
            $in = implode(',', array_fill(0, count($myGroups), '?'));
            array_push($params, ...$myGroups);
            $sql .= " OR e.group_id IN ($in)";
        }
        return Database::all($sql, $params);
    }

    public static function ledger(string $residentId): array
    {
        Auth::requireLogin();
        if (!Auth::$isAdmin && $residentId !== Auth::myResidentId()) {
            throw new ApiError(403, 'You can only view your own ledger');
        }
        return Database::all(
            'SELECT * FROM ledger_entries WHERE resident_id = ? ORDER BY created_at DESC, id DESC',
            [$residentId]
        );
    }

    public static function choreList(): array
    {
        $chores = Database::all('SELECT * FROM chores ORDER BY name');
        $members = Database::all('SELECT chore_id, resident_id, position FROM chore_members ORDER BY position');
        foreach ($chores as &$c) {
            $c['members'] = array_map(fn ($m) => $m['resident_id'],
                array_values(array_filter($members, fn ($m) => $m['chore_id'] === $c['id'])));
        }
        return $chores;
    }

    public static function choreEvents(): array
    {
        Auth::requireLogin();
        return Database::all('SELECT * FROM chore_events ORDER BY created_at DESC, id DESC LIMIT 50');
    }

    public static function issues(): array
    {
        Auth::requireLogin();
        return Database::all('SELECT * FROM issues ORDER BY created_at DESC');
    }

    public static function auditRows(): array
    {
        Auth::can('audit.read');
        return Database::all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100');
    }

    public static function hubItems(string $kind): array
    {
        Auth::requireLogin();
        return Database::all('SELECT * FROM hub_items WHERE kind = ? ORDER BY created_at DESC', [$kind]);
    }

    public static function hubResponses(string $kind): array
    {
        Auth::requireLogin();
        return Database::all(
            'SELECT hr.* FROM hub_responses hr JOIN hub_items hi ON hi.id = hr.item_id WHERE hi.kind = ?',
            [$kind]
        );
    }

    public static function portalRoles(): array
    {
        Auth::requireLogin();
        $roles = Database::all('SELECT * FROM portal_roles ORDER BY name');
        $permRows = Database::all('SELECT role_id, permission FROM portal_role_permissions');
        foreach ($roles as &$r) {
            $r['permissions'] = array_map(fn ($p) => $p['permission'],
                array_values(array_filter($permRows, fn ($p) => $p['role_id'] === $r['id'])));
        }
        return $roles;
    }

    public static function portalRoleMembers(): array
    {
        Auth::requireLogin();
        $rows = Database::all('SELECT role_id, user_id FROM portal_role_members');
        if (Auth::$isAdmin) {
            return $rows;
        }
        $uid = Auth::$user['id'];
        return array_values(array_filter($rows, fn ($m) => $m['user_id'] === $uid));
    }

    public static function adminResidentIds(): array
    {
        Auth::requireLogin();
        return array_map(
            fn ($r) => $r['resident_id'],
            Database::all(
                'SELECT r.id AS resident_id FROM residents r JOIN user_roles ur ON ur.user_id = r.user_id AND ur.role = \'admin\''
            )
        );
    }

    public static function notifications(): array
    {
        Auth::requireLogin();
        $uid = Auth::$user['id'];
        $params = [$uid];
        $visible = '(n.audience = \'user\' AND n.user_id = ?)';
        if (Auth::$isAdmin) {
            $visible .= ' OR n.audience = \'admin\'';
        }
        $rows = Database::all(
            "SELECT n.*, nr.read_at FROM notifications n
              LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
             WHERE $visible
              ORDER BY n.created_at DESC LIMIT 50",
            $params
        );
        return $rows;
    }

    public static function unreadNotificationCount(): int
    {
        Auth::requireLogin();
        $uid = Auth::$user['id'];
        $visible = "(n.audience = 'user' AND n.user_id = ?)";
        $params = [$uid];
        if (Auth::$isAdmin) {
            $visible .= " OR n.audience = 'admin'";
        }
        $row = Database::row(
            "SELECT COUNT(*) AS un FROM notifications n
              LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
             WHERE $visible AND nr.read_at IS NULL",
            $params
        );
        return (int) ($row['un'] ?? 0);
    }
}
