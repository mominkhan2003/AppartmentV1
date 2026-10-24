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
                'username' => Auth::$user['username'] ?? null,
            ],
            'isAdmin' => Auth::$isAdmin,
            'approved' => Auth::$approved,
            'force_password_change' => Auth::$forcePasswordChange,
            'permissions' => Auth::$permissions,
            'resident' => Auth::$resident,
        ];
    }

    /** Admin-only directory of login accounts with their approval state. */
    public static function accounts(): array
    {
        Auth::requireAdmin();
        return Database::all(
            "SELECT u.id, u.email, u.username, u.approved, u.created_at,
                    r.id AS resident_id, r.display_name,
                    (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS admin_roles,
                    (SELECT GROUP_CONCAT(pr.name SEPARATOR ', ')
                       FROM portal_role_members m JOIN portal_roles pr ON pr.id = m.role_id
                      WHERE m.user_id = u.id) AS portal_roles
               FROM app_users u LEFT JOIN residents r ON r.user_id = u.id
              ORDER BY u.approved ASC, u.created_at DESC"
        );
    }

    /** MySQL returns JSON columns as strings; normalize them so the API always yields real arrays. */
    private static function decodeJson(array $rows, array $fields): array
    {
        foreach ($rows as $i => $row) {
            foreach ($fields as $field) {
                if (isset($row[$field]) && is_string($row[$field])) {
                    $decoded = json_decode($row[$field], true);
                    $row[$field] = is_array($decoded) ? $decoded : [];
                } elseif (!isset($row[$field]) || $row[$field] === null) {
                    $row[$field] = [];
                }
            }
            $rows[$i] = $row;
        }
        return $rows;
    }

    public static function spaces(): array
    {
        return self::decodeJson(
            Database::all('SELECT id, code, name, kind, shape, capacity, notes, sort, created_at FROM spaces ORDER BY sort, code'),
            ['shape']
        );
    }

    /** Weekly meal timetable (week_start is a Monday; cook name joined for display). */
    public static function mealPlan(string $weekStart): array
    {
        Auth::requireLogin();
        return self::decodeJson(
            Database::all(
                "SELECT mp.*, r.display_name AS cook_name
                   FROM meal_plan mp LEFT JOIN residents r ON r.id = mp.cook_resident_id
                  WHERE mp.week_start = ?
                  ORDER BY Field(mp.meal, 'dinner', 'lunch', 'breakfast'), mp.day_of_week",
                [$weekStart]
            ),
            ['participants']
        );
    }

    public static function residents(): array
    {
        return Database::all('SELECT * FROM residents ORDER BY display_name');
    }

    public static function groupsWithMembers(): array
    {
        $groups = Database::all('SELECT * FROM household_groups ORDER BY name');
        $members = Database::all('SELECT group_id, resident_id FROM group_members');
        // memberships of deleted residents disappear automatically
        $existing = array_column(Database::all('SELECT id FROM residents'), 'id');
        foreach ($groups as &$g) {
            $g['members'] = array_values(array_filter($members, fn ($m) => $m['group_id'] === $g['id'] && in_array($m['resident_id'], $existing, true)));
            $g['members'] = array_map(fn ($m) => $m['resident_id'], $g['members']);
        }
        return $groups;
    }

    public static function washroomAccess(): array
    {
        return Database::all('SELECT washroom_id, bedroom_id FROM washroom_access');
    }

    /**
     * Group cash overview. Strictly three moving parts:
     *   contributions (kind=payment)   -> add to the pool
     *   purchases    (approved expenses) -> drain the pool
     *   adjustments/debt settlements  -> only move money between members, never the pool
     * The pool therefore equals total member balances, always.
     */
    public static function poolOverview(): array
    {
        Auth::requireLogin();
        $cashContributions = (int) (Database::row(
            "SELECT COALESCE(SUM(amount_cents), 0) AS v FROM ledger_entries WHERE kind = 'payment' AND source = 'cash'"
        )['v'] ?? 0);
        $directContributions = (int) (Database::row(
            "SELECT COALESCE(SUM(amount_cents), 0) AS v FROM ledger_entries WHERE kind = 'payment' AND source = 'direct'"
        )['v'] ?? 0);
        $poolPurchases = (int) (Database::row(
            "SELECT COALESCE(SUM(amount_cents), 0) AS v FROM expenses WHERE status = 'approved' AND funding_source = 'pool'"
        )['v'] ?? 0);
        $directPurchases = (int) (Database::row(
            "SELECT COALESCE(SUM(amount_cents), 0) AS v FROM expenses WHERE status = 'approved' AND funding_source = 'direct'"
        )['v'] ?? 0);
        $adjustments = (int) (Database::row(
            "SELECT COALESCE(SUM(ABS(amount_cents)), 0) AS v FROM ledger_entries WHERE kind = 'adjustment'"
        )['v'] ?? 0);
        $credits = (int) (Database::row(
            "SELECT COALESCE(SUM(amount_cents), 0) AS v FROM ledger_entries WHERE kind = 'claim_credit'"
        )['v'] ?? 0);

        // Overall group balance = total group contributions - total group purchases.
        // Direct store payments are recorded as both a contribution and a purchase,
        // so they never change the pool cash unless they are explicitly settled.
        $contributions = $cashContributions + $directContributions;
        $purchases = $poolPurchases + $directPurchases;
        return [
            'contributions_cents' => $contributions,
            'purchases_cents' => $purchases,
            'cash_contributions_cents' => $cashContributions,
            'direct_contributions_cents' => $directContributions,
            'pool_purchases_cents' => $poolPurchases,
            'direct_purchases_cents' => $directPurchases,
            'adjustments_cents' => $adjustments,
            'claim_credits_cents' => $credits,
            'pool_balance_cents' => $contributions - $purchases,
            'formula' => 'overall_group_balance = total_group_contributions - total_group_purchases',
        ];
    }

    /** Dashboard-friendly member status derived from contribution rounds. */
    public static function financeOverview(): array
    {
        Auth::requireLogin();
        $pool = self::poolOverview();
        $members = Database::all(
            "SELECT r.id, r.display_name, r.active, u.username, u.email,
                    (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS admin_roles
               FROM residents r LEFT JOIN app_users u ON u.id = r.user_id
              ORDER BY r.display_name"
        );
        $dues = Database::all(
            "SELECT d.resident_id, d.required_cents, d.paid_cents, d.status, d.note,
                    cr.round_no, cr.label, cr.collected_on
               FROM contribution_dues d JOIN contribution_rounds cr ON cr.id = d.round_id
              ORDER BY cr.round_no, d.resident_id"
        );
        $byResident = [];
        foreach ($dues as $due) {
            $byResident[$due['resident_id']][] = $due;
        }
        foreach ($members as &$member) {
            $rows = $byResident[$member['id']] ?? [];
            $outstanding = 0;
            $pendingRound = null;
            $pendingNote = null;
            foreach ($rows as $row) {
                if ($row['status'] === 'pending' || $row['status'] === 'partial') {
                    $outstanding += max(0, (int) $row['required_cents'] - (int) $row['paid_cents']);
                    $pendingRound = $row;
                    $pendingNote = $row['note'];
                }
            }
            $member['is_admin'] = ((int) ($member['admin_roles'] ?? 0)) > 0;
            $member['active'] = ((int) $member['active']) === 1;
            $member['outstanding_cents'] = $outstanding;
            $member['status'] = $outstanding > 0 ? 'pending' : 'settled';
            $member['status_note'] = $pendingNote;
            $member['pending_round'] = $pendingRound ? [
                'round_no' => (int) $pendingRound['round_no'],
                'label' => $pendingRound['label'],
                'required_cents' => (int) $pendingRound['required_cents'],
                'paid_cents' => (int) $pendingRound['paid_cents'],
            ] : null;
            unset($member['admin_roles']);
        }
        unset($member);
        $active = array_values(array_filter($members, fn ($m) => $m['active']));
        return [
            'pool' => $pool,
            'active_members' => count($active),
            'members' => $members,
            'rounds' => self::contributionRounds(),
            'next_budget_cents' => 1000,
        ];
    }

    /** Rounds with their per-member dues, used by the report and dashboard. */
    public static function contributionRounds(): array
    {
        $rounds = Database::all('SELECT * FROM contribution_rounds ORDER BY round_no');
        $dues = Database::all(
            "SELECT d.*, r.display_name FROM contribution_dues d
               JOIN residents r ON r.id = d.resident_id
              ORDER BY d.round_id, r.display_name"
        );
        foreach ($rounds as &$round) {
            $round['dues'] = array_values(array_filter($dues, fn ($d) => $d['round_id'] === $round['id']));
            $round['collected_cents'] = array_sum(array_map(fn ($d) => (int) $d['paid_cents'], $round['dues']));
            $round['required_cents'] = array_sum(array_map(fn ($d) => (int) $d['required_cents'], $round['dues']));
        }
        return $rounds;
    }

    /**
     * Structured audit report: summary, member statuses, rounds and a single
     * chronological movement list with a running pool-cash balance.
     */
    public static function financialReport(): array
    {
        Auth::requireLogin();
        $pool = self::poolOverview();
        $overview = self::financeOverview();
        $members = Database::all(
            "SELECT r.id, r.display_name, r.active, u.username,
                    (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS admin_roles
               FROM residents r LEFT JOIN app_users u ON u.id = r.user_id
              ORDER BY r.display_name"
        );
        foreach ($members as &$member) {
            $member['is_admin'] = ((int) ($member['admin_roles'] ?? 0)) > 0;
            $member['active'] = ((int) $member['active']) === 1;
            unset($member['admin_roles']);
        }
        unset($member);

        $rows = [];
        $contributions = Database::all(
            "SELECT l.id, l.entry_date, l.created_at, l.amount_cents, l.note, l.round_label, l.source,
                    r.display_name
               FROM ledger_entries l JOIN residents r ON r.id = l.resident_id
              WHERE l.kind = 'payment'
              ORDER BY COALESCE(l.entry_date, DATE(l.created_at)), l.sort_order, l.created_at, l.id"
        );
        $contributionGroups = [];
        foreach ($contributions as $row) {
            if (($row['source'] ?? 'cash') === 'direct') {
                continue; // represented by the matching direct expense row
            }
            $date = (string) ($row['entry_date'] ?: substr((string) $row['created_at'], 0, 10));
            $round = (string) ($row['round_label'] ?: 'Contribution');
            $groupKey = $date . '|' . $round;
            if (!isset($contributionGroups[$groupKey])) {
                $contributionGroups[$groupKey] = [
                    'key' => 'contribution:' . $groupKey,
                    'date' => $date,
                    'type' => 'contribution',
                    'description' => $round === 'Round 1'
                        ? 'Initial Pool Contribution (€15 × 3)'
                        : $round . ' budget contribution',
                    'paid_by' => [],
                    'amount_cents' => 0,
                    'pool_delta_cents' => 0,
                    'round_label' => $round,
                    'source' => 'cash',
                ];
            }
            $contributionGroups[$groupKey]['amount_cents'] += (int) $row['amount_cents'];
            $contributionGroups[$groupKey]['pool_delta_cents'] += (int) $row['amount_cents'];
            $contributionGroups[$groupKey]['paid_by'][] = (string) $row['display_name'];
        }
        foreach ($contributionGroups as $group) {
            $group['paid_by'] = implode(', ', array_values(array_unique($group['paid_by'])));
            $rows[] = $group;
        }
        $expenses = Database::all(
            "SELECT e.id, e.expense_date, e.created_at, e.title, e.description, e.amount_cents,
                    e.funding_source, e.round_label, e.category,
                    r.display_name AS payer_name
               FROM expenses e LEFT JOIN residents r ON r.id = e.payer_resident_id
              WHERE e.status = 'approved'
              ORDER BY e.expense_date, e.created_at, e.id"
        );
        foreach ($expenses as $row) {
            $isDirect = ($row['funding_source'] ?? 'pool') === 'direct';
            $rows[] = [
                'key' => 'expense:' . $row['id'],
                'date' => (string) $row['expense_date'],
                'type' => $isDirect ? 'direct_payment' : 'expense',
                'description' => (string) $row['title'],
                'paid_by' => $isDirect ? (($row['payer_name'] ?: 'Member') . ' (direct)') : 'Pool Account',
                'amount_cents' => (int) $row['amount_cents'],
                'pool_delta_cents' => $isDirect ? 0 : -(int) $row['amount_cents'],
                'round_label' => $row['round_label'],
                'source' => $isDirect ? 'direct' : 'pool',
            ];
        }
        usort($rows, function (array $a, array $b): int {
            return [$a['date'], $a['key']] <=> [$b['date'], $b['key']];
        });
        $running = 0;
        foreach ($rows as &$row) {
            $running += (int) $row['pool_delta_cents'];
            $row['running_balance_cents'] = $running;
        }
        unset($row);

        return [
            'title' => 'Flatmate Financial Audit Ledger',
            'subtitle' => 'Official Shared Expense & Contribution Tracking Document',
            'period_start' => '2026-10-02',
            'period_end' => '2026-10-24',
            'generated_at' => gmdate('c'),
            'pool' => $pool,
            'active_members' => $overview['active_members'],
            'members' => $members,
            'member_status' => $overview['members'],
            'rounds' => $overview['rounds'],
            'entries' => $rows,
            'closing_balance_cents' => $running,
            'next_budget_cents' => 1000,
            'pending_contribution_cents' => array_sum(array_map(
                fn ($m) => (int) $m['outstanding_cents'],
                $overview['members']
            )),
        ];
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
        return self::decodeJson(
            Database::all(
                "SELECT e.*, ra.file_path AS receipt_file_path, ra.mime_type AS receipt_mime
                   FROM expenses e LEFT JOIN media_assets ra ON ra.id = e.receipt_media_id
                  $where
                  ORDER BY e.expense_date DESC, e.created_at DESC",
                $params
            ),
            ['items']
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
        $memberRows = Database::all('SELECT chore_id, resident_id, position FROM chore_members ORDER BY position');
        // Rosters always follow the residents table: memberships pointing at deleted members drop out here.
        $existing = array_column(Database::all('SELECT id FROM residents'), 'id');
        $memberRows = array_values(array_filter($memberRows, fn ($m) => in_array($m['resident_id'], $existing, true)));
        foreach ($chores as &$c) {
            $c['members'] = array_map(fn ($m) => $m['resident_id'],
                array_values(array_filter($memberRows, fn ($m) => $m['chore_id'] === $c['id'])));
            // stale assignee (resident deleted) auto-falls back: rotate to first living member or nobody
            if ($c['current_resident_id'] !== null && !in_array($c['current_resident_id'], $c['members'], true)) {
                $c['current_resident_id'] = $c['members'][0] ?? null;
            }
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
        return self::decodeJson(
            Database::all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100'),
            ['details']
        );
    }

    public static function hubItems(string $kind): array
    {
        Auth::requireLogin();
        return self::decodeJson(
            Database::all('SELECT * FROM hub_items WHERE kind = ? ORDER BY created_at DESC', [$kind]),
            ['payload']
        );
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
        // The SQL carries two placeholders: one for the join, one for the visibility clause.
        $params = [$uid, $uid];
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
        // Two placeholders: the join and the visibility clause.
        $params = [$uid, $uid];
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
