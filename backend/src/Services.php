<?php
declare(strict_types=1);

/**
 * Domain services — every method here is the exact equivalent of one of the original
 * SECURITY DEFINER Postgres functions (drizzle/migrations/*), executed inside a DB
 * transaction so related writes stay atomic:
 *
 *   record_shared_expense / _apply_split      -> recordSharedExpense / applySplit
 *   review_claim / void_expense               -> reviewClaim / voidExpense
 *   record_payment / add_adjustment           -> recordPayment / addAdjustment
 *   complete_chore / admin_chore_action       -> completeChore / choreAdminAction
 *   report_chore_needed / next_chore_member   -> reportChoreNeeded / nextChoreMember
 *   on_resident_deactivated (trigger)         -> reassignChoresOf
 *   set_admin                                 -> setAdmin
 *   save/assign/delete_portal_role            -> savePortalRole / assignPortalRoles / deletePortalRole
 *   hub_respond / hub_set_status / hub_edit_item -> hubRespond / hubSetStatus / hubEditItem
 */
final class Services
{
    /* --------------------------------------------------------------- helpers */

    private static function nextChoreMember(string $choreId, ?string $afterResidentId): ?string
    {
        $position = null;
        if ($afterResidentId !== null) {
            $row = Database::row(
                'SELECT position FROM chore_members WHERE chore_id = ? AND resident_id = ?',
                [$choreId, $afterResidentId]
            );
            $position = $row ? (int) $row['position'] : -1;
        } else {
            $position = -1;
        }
        $next = Database::row(
            'SELECT cm.resident_id FROM chore_members cm JOIN residents r ON r.id = cm.resident_id
              WHERE cm.chore_id = ? AND r.active = 1 AND cm.position > ? ORDER BY cm.position LIMIT 1',
            [$choreId, $position]
        );
        if ($next) {
            return (string) $next['resident_id'];
        }
        $first = Database::row(
            'SELECT cm.resident_id FROM chore_members cm JOIN residents r ON r.id = cm.resident_id
              WHERE cm.chore_id = ? AND r.active = 1 ORDER BY cm.position LIMIT 1',
            [$choreId]
        );
        return $first ? (string) $first['resident_id'] : null;
    }

    /** Duplicates are rejected while the previous expense still exists un-rejected (index parity). */
    private static function assertReceiptUnused(?string $receiptMediaId, ?string $receiptHash): void
    {
        if ($receiptHash !== null) {
            $dup = Database::row(
                "SELECT id FROM expenses WHERE receipt_hash = ? AND status <> 'rejected'",
                [$receiptHash]
            );
            if ($dup) {
                throw new ApiError(409, 'This receipt was already used by another expense');
            }
        }
        if ($receiptMediaId !== null) {
            $dup = Database::row(
                "SELECT id FROM expenses WHERE receipt_media_id = ? AND status <> 'rejected'",
                [$receiptMediaId]
            );
            if ($dup) {
                throw new ApiError(409, 'This receipt file was already used by another expense');
            }
        }
    }

    /* -------------------------------------------------------------- expenses */

    public static function recordSharedExpense(array $body): int
    {
        Auth::requireAdmin();
        $title = Req::text($body, 'title', 120, true);
        $amount = Req::positiveInt($body, 'amount_cents', true);
        $description = Req::text($body, 'description', 2000);
        $category = Req::text($body, 'category', 40) ?? 'general';
        $expenseDate = Req::date($body, 'expense_date') ?? date('Y-m-d');
        $groupId = Req::uuid($body, 'group_id');
        $notes = Req::text($body, 'notes', 2000);
        $receiptMediaId = Req::uuid($body, 'receipt_media_id');
        $receiptHash = Req::text($body, 'receipt_hash');
        $participants = array_values(array_filter(array_map(
            fn ($v) => trim((string) $v),
            is_array($body['participants'] ?? null) ? (array) $body['participants'] : []
        )));
        $custom = is_array($body['custom'] ?? null) ? (array) $body['custom'] : null;

        Database::beginTransaction();
        try {
            self::ensureParticipantsInGroup($groupId, $participants, $custom);
            self::assertReceiptUnused($receiptMediaId, $receiptHash);
            Database::run(
                'INSERT INTO expenses (kind, group_id, title, description, category, amount_cents, expense_date, payer_resident_id,
                       receipt_media_id, receipt_hash, notes, items, status, created_by, reviewed_by, reviewed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
                [
                    'shared', $groupId, $title, $description, $category, $amount, $expenseDate,
                    $receiptMediaId, $receiptHash, $notes, null, 'approved', Auth::$user['id'], Auth::$user['id'],
                ]
            );
            $expenseId = (int) Database::insertId();
            self::applySplit($expenseId, $amount, $participants, $custom);
            Audit::log('record_shared_expense', 'expense', (string) $expenseId, [
                'amount_cents' => $amount, 'group_id' => $groupId, 'title' => $title,
            ]);
            Database::commit();
            return $expenseId;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function submitClaim(array $body): int
    {
        Auth::requireLogin();
        $me = Auth::myResidentId();
        if ($me === null) {
            throw new ApiError(400, 'Your resident account is not linked');
        }
        $title = Req::text($body, 'title', 120, true);
        $amount = Req::positiveInt($body, 'amount_cents', true);
        $groupId = Req::uuid($body, 'group_id');
        if ($groupId !== null && !Permissions::inGroup($groupId)) {
            throw new ApiError(403, 'You can only submit claims for one of your groups');
        }
        $receiptMediaId = Req::uuid($body, 'receipt_media_id');
        $receiptHash = Req::text($body, 'receipt_hash');
        self::assertReceiptUnused($receiptMediaId, $receiptHash);
        Database::run(
            'INSERT INTO expenses (kind, group_id, title, description, category, amount_cents, expense_date, payer_resident_id,
                   receipt_media_id, receipt_hash, notes, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                'claim', $groupId, $title, Req::text($body, 'description', 2000), Req::text($body, 'category', 40) ?? 'general',
                $amount, Req::date($body, 'expense_date') ?? date('Y-m-d'), $me,
                $receiptMediaId, $receiptHash, Req::text($body, 'notes', 2000), 'pending', Auth::$user['id'],
            ]
        );
        $expenseId = (int) Database::insertId();
        // Trigger parity: audit_expense_insert()
        Audit::log('submit_claim', 'expense', (string) $expenseId, [
            'amount_cents' => $amount, 'title' => $title,
        ]);
        return $expenseId;
    }

    public static function reviewClaim(string $expenseId, bool $approve, ?string $note): void
    {
        Auth::requireAdmin();
        Database::beginTransaction();
        try {
            $expense = Database::row('SELECT * FROM expenses WHERE id = ? FOR UPDATE', [$expenseId]);
            if (!$expense) {
                throw new ApiError(404, 'Claim not found');
            }
            if ($expense['kind'] !== 'claim') {
                throw new ApiError(400, 'Not a claim');
            }
            if ($expense['status'] !== 'pending') {
                throw new ApiError(400, 'Claim already reviewed');
            }
            // "You cannot review your own claim"
            $payerResidentId = $expense['payer_resident_id'];
            $payerUser = Database::row('SELECT user_id FROM residents WHERE id = ?', [$payerResidentId]);
            if ($payerResidentId !== null
                && ($expense['created_by'] === Auth::$user['id'] || ($payerUser && $payerUser['user_id'] === Auth::$user['id']))) {
                throw new ApiError(403, 'You cannot review your own claim');
            }
            $status = $approve ? 'approved' : 'rejected';
            Database::run(
                'UPDATE expenses SET status = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(), review_note = ? WHERE id = ?',
                [$status, Auth::$user['id'], $note, $expenseId]
            );
            if ($approve) {
                if ($payerResidentId === null) {
                    throw new ApiError(400, 'This claim has no payer to reimburse');
                }
                Database::run(
                    'INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, expense_id, note, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [Uuid::v4(), (string) $payerResidentId, 'claim_credit', (int) $expense['amount_cents'],
                     $expenseId, 'Approved reimbursement: ' . $expense['title'], Auth::$user['id']]
                );
            }
            Audit::log($approve ? 'approve_claim' : 'reject_claim', 'expense', $expenseId, [
                'note' => $note, 'amount_cents' => (int) $expense['amount_cents'],
            ]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function voidExpense(string $expenseId, string $reason): void
    {
        Auth::requireAdmin();
        if (trim($reason) === '') {
            throw new ApiError(400, 'A reason is required');
        }
        Database::beginTransaction();
        try {
            $expense = Database::row('SELECT * FROM expenses WHERE id = ? FOR UPDATE', [$expenseId]);
            if (!$expense) {
                throw new ApiError(404, 'Expense not found');
            }
            if ($expense['status'] !== 'approved') {
                throw new ApiError(400, 'Only approved entries can be voided');
            }
            $st = Database::get()->prepare(
                'INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, expense_id, note, created_by)
                 SELECT ?, resident_id, ?, -SUM(amount_cents), expense_id, ?, ?
                   FROM ledger_entries WHERE expense_id = ? GROUP BY resident_id HAVING SUM(amount_cents) <> 0'
            );
            $st->execute([
                Uuid::v4(), 'adjustment', 'Reversal: ' . trim($reason), Auth::$user['id'], $expenseId,
            ]);
            Database::run(
                "UPDATE expenses SET status = 'voided', review_note = CONCAT(CASE WHEN review_note IS NULL THEN '' ELSE CONCAT(review_note, ' | ') END, ?) WHERE id = ?",
                ['Voided: ' . trim($reason), $expenseId]
            );
            Audit::log('void_expense', 'expense', $expenseId, ['reason' => $reason]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function recordPayment(string $residentId, int $amountCents, ?string $note): void
    {
        Auth::requireAdmin();
        if ($amountCents === 0) {
            throw new ApiError(400, 'Amount cannot be zero');
        }
        if (!Database::row('SELECT id FROM residents WHERE id = ?', [$residentId])) {
            throw new ApiError(404, 'Resident not found');
        }
        Database::run(
            'INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [Uuid::v4(), $residentId, 'payment', $amountCents, $note, Auth::$user['id']]
        );
        Audit::log('record_payment', 'resident', $residentId, ['amount_cents' => $amountCents, 'note' => $note]);
    }

    public static function addAdjustment(string $residentId, int $amountCents, string $reason): void
    {
        Auth::requireAdmin();
        if (trim($reason) === '') {
            throw new ApiError(400, 'A reason is required');
        }
        if (!Database::row('SELECT id FROM residents WHERE id = ?', [$residentId])) {
            throw new ApiError(404, 'Resident not found');
        }
        Database::run(
            'INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [Uuid::v4(), $residentId, 'adjustment', $amountCents, $reason, Auth::$user['id']]
        );
        Audit::log('add_adjustment', 'resident', $residentId, ['amount_cents' => $amountCents, 'reason' => $reason]);
    }

    public static function applySplit(int $expenseId, int $amountCents, array $participants, ?array $custom): void
    {
        if (is_array($custom) && $custom) {
            $total = 0;
            foreach ($custom as $residentId => $value) {
                if (!Uuid::isValid((string) $residentId)) {
                    throw new ApiError(400, 'Custom share keys must be resident ids');
                }
                $amount = (int) $value;
                if ($amount < 0) {
                    throw new ApiError(400, 'Negative share');
                }
                if ($amount === 0) {
                    continue;
                }
                $total += $amount;
                Database::run('INSERT INTO expense_shares (id, expense_id, resident_id, amount_cents) VALUES (?, ?, ?, ?)',
                    [Uuid::v4(), $expenseId, (string) $residentId, $amount]);
                Database::run('INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, expense_id, note, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [Uuid::v4(), (string) $residentId, 'share', -$amount, $expenseId, 'Share of expense', Auth::$user['id'] ?? null]);
            }
            if ($total !== $amountCents) {
                throw new ApiError(400, "Custom shares ($total) must add up to the total ($amountCents)");
            }
            return;
        }
        $n = count($participants);
        if ($n === 0) {
            throw new ApiError(400, 'Select at least one participant');
        }
        $base = intdiv($amountCents, $n);
        $rem = $amountCents - $base * $n;
        $i = 0;
        foreach ($participants as $pid) {
            $i++;
            $amt = $base + ($i <= $rem ? 1 : 0);
            Database::run('INSERT INTO expense_shares (id, expense_id, resident_id, amount_cents) VALUES (?, ?, ?, ?)',
                [Uuid::v4(), $expenseId, (string) $pid, $amt]);
            Database::run('INSERT INTO ledger_entries (id, resident_id, kind, amount_cents, expense_id, note, created_by)
                           VALUES (?, ?, ?, ?, ?, ?, ?)',
                [Uuid::v4(), (string) $pid, 'share', -$amt, $expenseId, 'Share of expense', Auth::$user['id'] ?? null]);
        }
    }

    private static function ensureParticipantsInGroup(?string $groupId, array $participants, ?array $custom): void
    {
        if ($groupId === null) {
            return;
        }
        $team = array_merge($participants, array_keys($custom ?? []));
        foreach ($team as $rid) {
            if (!Uuid::isValid((string) $rid)) {
                throw new ApiError(400, 'All participants must belong to the selected group');
            }
            if (!Database::row('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND resident_id = ?', [$groupId, (string) $rid])) {
                throw new ApiError(400, 'All participants must belong to the selected group');
            }
        }
    }

    /* --------------------------------------------------- household & residents */

    public static function upsertResident(?string $id, array $body): string
    {
        Auth::requireLogin();
        $admin = Auth::$isAdmin;
        if ($id === null) {
            if (!$admin) {
                throw new ApiError(403, 'Admin only');
            }
            $name = Req::text($body, 'display_name', 120, true);
            $rid = Uuid::v4();
            Database::run(
                'INSERT INTO residents (id, display_name, email, phone, room_id, active, is_sample) VALUES (?, ?, ?, ?, ?, ?, 0)',
                [$rid, $name, Req::text($body, 'email'), Req::text($body, 'phone'), Req::uuid($body, 'room_id'),
                 Req::bool($body, 'active') ? 1 : 0]
            );
            Audit::log('create_resident', 'resident', $rid, ['display_name' => $name]);
            return $rid;
        }
        $row = Database::row('SELECT * FROM residents WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Resident not found');
        }
        $self = ($row['user_id'] ?? null) === (Auth::$user['id'] ?? null);
        if (!$admin && !$self) {
            throw new ApiError(403, 'You may only edit your own profile');
        }
        $sets = []; $params = [];
        if ($name = Req::text($body, 'display_name', 120)) {
            $sets[] = 'display_name = ?'; $params[] = $name;
        }
        if ($phone = Req::text($body, 'phone')) {
            $sets[] = 'phone = ?'; $params[] = $phone;
        }
        if ($admin) {
            if (array_key_exists('email', $body)) {
                $email = Req::text($body, 'email');
                if ($email !== null) {
                    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                        throw new ApiError(400, 'Enter a valid email address');
                    }
                    if (Database::row('SELECT id FROM residents WHERE email = ? AND id <> ?', [$email, $id])) {
                        throw new ApiError(409, 'This email belongs to another resident');
                    }
                }
                $sets[] = 'email = ?'; $params[] = $email;
            }
            if (array_key_exists('room_id', $body)) {
                $sets[] = 'room_id = ?'; $params[] = Req::uuid($body, 'room_id');
            }
            if (array_key_exists('active', $body)) {
                $sets[] = 'active = ?'; $params[] = Req::bool($body, 'active') ? 1 : 0;
            }
            if (array_key_exists('is_sample', $body)) {
                $sets[] = 'is_sample = ?'; $params[] = (int) (bool) $body['is_sample'];
            }
        }
        if (!$sets) {
            return $id;
        }
        $wasActive = (bool) $row['active'];
        $params[] = $id;
        Database::run('UPDATE residents SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        // Trigger parity: on_resident_deactivated() reassigns chores the person hosted.
        $newActive = array_key_exists('active', $body) ? (bool) Req::bool($body, 'active') : $wasActive;
        if ($wasActive && !$newActive) {
            self::reassignChoresOf($id);
        }
        Audit::log('update_resident', 'resident', $id, ['fields' => array_keys($sets)]);
        return $id;
    }

    public static function reassignChoresOf(string $residentId): void
    {
        $chores = Database::all('SELECT id FROM chores WHERE current_resident_id = ?', [$residentId]);
        foreach ($chores as $c) {
            $next = self::nextChoreMember((string) $c['id'], $residentId);
            Database::run('UPDATE chores SET current_resident_id = ? WHERE id = ?', [$next, $c['id']]);
        }
    }

    public static function deleteResident(string $id): void
    {
        Auth::requireAdmin();
        if (!Database::row('SELECT id FROM residents WHERE id = ?', [$id])) {
            throw new ApiError(404, 'Resident not found');
        }
        self::reassignChoresOf($id);
        Database::run('DELETE FROM residents WHERE id = ?', [$id]);
        Audit::log('delete_resident', 'resident', $id);
    }

    /* ----------------------------------------------------------------- chores */

    public static function saveChore(?string $id, array $body): string
    {
        Auth::requireAdmin();
        $name = Req::text($body, 'name', 120, true);
        $kind = Req::enum($body, 'kind', ['washroom', 'hall', 'kitchen', 'garbage', 'other']);
        $frequency = Req::int($body, 'frequency_days', true);
        if ($frequency < 1 || $frequency > 60) {
            throw new ApiError(400, 'Frequency must be between 1 and 60 days');
        }
        $members = array_values(array_filter(array_map(
            fn ($v) => trim((string) $v),
            is_array($body['members'] ?? null) ? (array) $body['members'] : []
        )));
        $current = Req::uuid($body, 'current_resident_id') ?? ($members[0] ?? null);
        if ($current !== null && !in_array($current, $members, true)) {
            throw new ApiError(400, 'The assigned resident must belong to the rotation');
        }
        Database::beginTransaction();
        try {
            if ($id === null) {
                $id = Uuid::v4();
                Database::run(
                    'INSERT INTO chores (id, name, kind, space_id, frequency_days, rotates, active, current_resident_id, next_due)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, $name, (string) $kind, Req::uuid($body, 'space_id'), $frequency,
                     Req::bool($body, 'rotates') ? 1 : 0, (Req::bool($body, 'active') || !array_key_exists('active', $body)) ? 1 : 0,
                     $current, Req::date($body, 'next_due') ?? date('Y-m-d')]
                );
            } else {
                $row = Database::row('SELECT id FROM chores WHERE id = ?', [$id]);
                if (!$row) {
                    throw new ApiError(404, 'Duty not found');
                }
                Database::run(
                    'UPDATE chores SET name = ?, kind = ?, space_id = ?, frequency_days = ?, rotates = ?, active = ?, current_resident_id = ?, next_due = ? WHERE id = ?',
                    [$name, (string) $kind, Req::uuid($body, 'space_id'), $frequency,
                     Req::bool($body, 'rotates') ? 1 : 0, Req::bool($body, 'active') ? 1 : 0,
                     $current, Req::date($body, 'next_due') ?? date('Y-m-d'), $id]
                );
            }
            foreach ($members as $position => $residentId) {
                if (!Uuid::isValid($residentId)) {
                    throw new ApiError(400, 'Membership list contains an invalid resident');
                }
                Database::run(
                    'UPDATE chore_members SET position = ? WHERE chore_id = ? AND resident_id = ?',
                    [$position, $id, $residentId]
                );
                $exists = Database::row('SELECT 1 AS ok FROM chore_members WHERE chore_id = ? AND resident_id = ?', [$id, $residentId]);
                if (!$exists) {
                    Database::run('INSERT INTO chore_members (chore_id, resident_id, position) VALUES (?, ?, ?)',
                        [$id, $residentId, $position]);
                }
            }
            $keep = $members;
            $all = Database::all('SELECT resident_id FROM chore_members WHERE chore_id = ?', [$id]);
            foreach ($all as $m) {
                if (!in_array($m['resident_id'], $keep, true)) {
                    Database::run('DELETE FROM chore_members WHERE chore_id = ? AND resident_id = ?', [$id, $m['resident_id']]);
                }
            }
            if ($current === null) {
                Database::run('UPDATE chores SET current_resident_id = ? WHERE id = ?', [self::nextChoreMember($id, null), $id]);
            }
            Audit::log($id ? 'update_chore' : 'create_chore', 'chore', $id, ['name' => $name]);
            Database::commit();
            return (string) $id;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function completeChore(string $choreId, ?string $note): void
    {
        Auth::requireLogin();
        $me = Auth::myResidentId();
        Database::beginTransaction();
        try {
            $c = Database::row('SELECT * FROM chores WHERE id = ? FOR UPDATE', [$choreId]);
            if (!$c) {
                throw new ApiError(404, 'Chore not found');
            }
            if ($c['current_resident_id'] === null) {
                throw new ApiError(400, 'Nobody is assigned to this duty yet');
            }
            if (!Auth::$isAdmin && ($me === null || $c['current_resident_id'] !== $me)) {
                throw new ApiError(403, 'Only the assigned resident can mark this complete');
            }
            // photo upload consumed here if provided
            $photoMediaId = null;
            if (isset($_FILES['file']) && is_array($_FILES['file']) && ($_FILES['file']['size'] ?? 0) > 0) {
                $stored = Media::store('photos', ['image/jpeg', 'image/png', 'image/webp']);
                $photoMediaId = (string) $stored['id'];
            }
            Database::run(
                'INSERT INTO chore_events (id, chore_id, event_type, resident_id, reason, photo_media_id, due_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [Uuid::v4(), $choreId, 'complete', $c['current_resident_id'], $note,
                 $photoMediaId, $c['next_due']]
            );
            $nextDue = max(date('Y-m-d'), (string) $c['next_due']);
            $base = strtotime($nextDue);
            if ($base === false) {
                $base = time();
            }
            $newDue = date('Y-m-d', strtotime('+' . (int) $c['frequency_days'] . ' days', $base));
            $rotates = (bool) $c['rotates'];
            $current = (string) $c['current_resident_id'];
            $next = $rotates ? self::nextChoreMember($choreId, $current) : $current;
            Database::run(
                'UPDATE chores SET current_resident_id = ?, next_due = ?, needed_reported_at = NULL WHERE id = ?',
                [$next, $newDue, $choreId]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function choreAdminAction(string $choreId, string $action, ?string $target, string $reason): void
    {
        Auth::requireAdmin();
        if (!in_array($action, ['skip', 'reassign', 'reset'], true)) {
            throw new ApiError(400, 'Unsupported action');
        }
        if (trim($reason) === '') {
            throw new ApiError(400, 'A reason is required');
        }
        Database::beginTransaction();
        try {
            $c = Database::row('SELECT * FROM chores WHERE id = ? FOR UPDATE', [$choreId]);
            if (!$c) {
                throw new ApiError(404, 'Chore not found');
            }
            $newCurrent = null;
            if ($action === 'skip') {
                $newCurrent = self::nextChoreMember($choreId, $c['current_resident_id']);
            } elseif ($action === 'reassign') {
                if ($target === null
                    || !Database::row(
                        'SELECT 1 AS ok FROM chore_members cm JOIN residents r ON r.id = cm.resident_id
                          WHERE cm.chore_id = ? AND cm.resident_id = ? AND r.active = 1',
                        [$choreId, $target]
                    )) {
                    throw new ApiError(400, 'Target must be an active member of this rotation');
                }
                $newCurrent = $target;
            } else { // reset
                $newCurrent = self::nextChoreMember($choreId, null);
            }
            Database::run(
                'INSERT INTO chore_events (id, chore_id, event_type, resident_id, target_resident_id, reason)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [Uuid::v4(), $choreId, $action, $c['current_resident_id'], $newCurrent, $reason]
            );
            Database::run('UPDATE chores SET current_resident_id = ? WHERE id = ?', [$newCurrent, $choreId]);
            Database::run(
                'INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
                [Auth::$user['id'], 'chore_' . $action, 'chore', $choreId,
                 json_encode(['reason' => $reason, 'target' => $newCurrent])]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function reportChoreNeeded(string $choreId, ?string $note): void
    {
        Auth::requireLogin();
        $me = Auth::myResidentId();
        if ($me === null && !Auth::$isAdmin) {
            throw new ApiError(403, 'Not a resident');
        }
        Database::run(
            'INSERT INTO chore_events (id, chore_id, event_type, resident_id, reason) VALUES (?, ?, ?, ?, ?)',
            [Uuid::v4(), $choreId, 'report_needed', $me, $note]
        );
        Database::run('UPDATE chores SET needed_reported_at = UTC_TIMESTAMP() WHERE id = ?', [$choreId]);
        $chore = Database::row('SELECT name FROM chores WHERE id = ?', [$choreId]);
        self::notifyAdmins('chore_reported', 'Chore flagged: ' . ($chore['name'] ?? 'duty'),
            $note ?? 'A resident reported this duty is needed', '/cleaning');
    }

    /* ----------------------------------------------------------------- issues */

    public static function createIssue(array $body): string
    {
        Auth::requireLogin();
        $description = Req::text($body, 'description', 2000, true);
        if (mb_strlen($description) < 3) {
            throw new ApiError(400, 'Describe the issue in at least 3 characters');
        }
        $photoMediaId = null;
        if (isset($_FILES['file']) && is_array($_FILES['file']) && ($_FILES['file']['size'] ?? 0) > 0) {
            $stored = Media::store('photos', ['image/jpeg', 'image/png', 'image/webp']);
            $photoMediaId = (string) $stored['id'];
        }
        $id = Uuid::v4();
        Database::run(
            "INSERT INTO issues (id, space_id, category, description, photo_media_id, reporter_id, reporter_resident_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
            [$id, Req::uuid($body, 'space_id'), Req::text($body, 'category', 40) ?? 'other',
             $description, $photoMediaId, Auth::$user['id'], Auth::myResidentId()]
        );
        self::notifyAdmins('issue_reported', 'New issue reported', mb_substr($description, 0, 120), '/issues');
        return $id;
    }

    public static function updateIssue(string $id, array $body): void
    {
        Auth::requirePermission('issues.manage');
        $row = Database::row('SELECT * FROM issues WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Issue not found');
        }
        $sets = []; $params = [];
        if (array_key_exists('status', $body)) {
            $sets[] = 'status = ?';
            $params[] = Req::enum($body, 'status', ['open', 'acknowledged', 'in_progress', 'resolved'], true);
        }
        if (array_key_exists('assigned_resident_id', $body)) {
            $sets[] = 'assigned_resident_id = ?';
            $params[] = Req::uuid($body, 'assigned_resident_id');
        }
        if (array_key_exists('admin_response', $body)) {
            $sets[] = 'admin_response = ?';
            $params[] = Req::text($body, 'admin_response', 2000);
        }
        if (array_key_exists('resolution_notes', $body)) {
            $sets[] = 'resolution_notes = ?';
            $params[] = Req::text($body, 'resolution_notes', 2000);
        }
        if (!$sets) {
            throw new ApiError(400, 'Nothing to update');
        }
        $params[] = $id;
        Database::run('UPDATE issues SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        Audit::log('update_issue', 'issue', $id, ['status' => $row['status']]);
    }

    /* ------------------------------------------------------ household extras */

    public static function notifyAdmins(string $type, string $title, ?string $body, ?string $link): void
    {
        Database::run(
            "INSERT INTO notifications (id, audience, user_id, type, title, body, link) VALUES (?, 'admin', NULL, ?, ?, ?, ?)",
            [Uuid::v4(), $type, $title, mb_substr((string) $body, 0, 500), $link]
        );
    }

    public static function notifyUser(string $userId, string $type, string $title, ?string $body, ?string $link): void
    {
        Database::run(
            "INSERT INTO notifications (id, audience, user_id, type, title, body, link) VALUES (?, 'user', ?, ?, ?, ?, ?)",
            [Uuid::v4(), $userId, $type, $title, mb_substr((string) $body, 0, 500), $link]
        );
    }

    /* ---------------------------------------------------- spaces / groups */

    public static function saveSpace(?string $id, array $body): string
    {
        Auth::requirePermission('household.manage');
        $name = Req::text($body, 'name', 120, true);
        $kind = Req::enum($body, 'kind', ['bedroom', 'kitchen', 'hall', 'balcony', 'washroom', 'storage', 'other']);
        $capacity = Req::int($body, 'capacity');
        $sort = Req::int($body, 'sort');
        $shape = is_array($body['shape'] ?? null) ? (array) $body['shape'] : [];
        Database::beginTransaction();
        try {
            if ($id === null) {
                $id = Uuid::v4();
                Database::run('INSERT INTO spaces (id, code, name, kind, shape, capacity, notes, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, Req::text($body, 'code', 20) ?? mb_substr($name, 0, 20), $name,
                     $kind ?? 'other', json_encode($shape), $capacity ?? 0, Req::text($body, 'notes'), $sort ?? 0]);
            } else {
                $row = Database::row('SELECT id FROM spaces WHERE id = ?', [$id]);
                if (!$row) {
                    throw new ApiError(404, 'Space not found');
                }
                // Partial edit: only touch the provided fields (a name/capacity edit must not reset kind/shape/sort).
                $sets = ['name = ?']; $params = [$name];
                if ($kind !== null) { $sets[] = 'kind = ?'; $params[] = $kind; }
                if (is_array($body['shape'] ?? null) || array_key_exists('shape', $body)) { $sets[] = 'shape = ?'; $params[] = json_encode($shape); }
                if ($capacity !== null) { $sets[] = 'capacity = ?'; $params[] = $capacity; }
                if (array_key_exists('notes', $body)) { $sets[] = 'notes = ?'; $params[] = Req::text($body, 'notes'); }
                if ($sort !== null) { $sets[] = 'sort = ?'; $params[] = $sort; }
                $params[] = $id;
                Database::run('UPDATE spaces SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            }
            Audit::log($id ? 'update_space' : 'create_space', 'space', $id, ['name' => $name]);
            Database::commit();
            return $id;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function deleteSpace(string $id): void
    {
        Auth::requirePermission('household.manage');
        if (!Database::row('SELECT id FROM spaces WHERE id = ?', [$id])) {
            throw new ApiError(404, 'Space not found');
        }
        Database::run('DELETE FROM spaces WHERE id = ?', [$id]);
        Audit::log('delete_space', 'space', $id);
    }

    public static function setWashroomAccess(array $body): void
    {
        Auth::requirePermission('household.manage');
        $washroom = Req::uuid($body, 'washroom_id', true);
        $bedroom = Req::uuid($body, 'bedroom_id', true);
        $washroomSpace = Database::row("SELECT kind FROM spaces WHERE id = ?", [$washroom]);
        $bedroomSpace = Database::row("SELECT kind FROM spaces WHERE id = ?", [$bedroom]);
        if (!$washroomSpace || $washroomSpace['kind'] !== 'washroom') {
            throw new ApiError(400, 'The washroom needs to be a washroom space');
        }
        if (!$bedroomSpace || $bedroomSpace['kind'] !== 'bedroom') {
            throw new ApiError(400, 'The linked space needs to be a bedroom');
        }
        Database::run(
            'INSERT INTO washroom_access (washroom_id, bedroom_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE bedroom_id = VALUES(bedroom_id)',
            [$washroom, $bedroom]
        );
        Audit::log('set_washroom_access', 'space', $washroom, ['bedroom_id' => $bedroom]);
    }

    public static function deleteWashroomAccess(string $washroomId, string $bedroomId): void
    {
        Auth::requirePermission('household.manage');
        Database::run('DELETE FROM washroom_access WHERE washroom_id = ? AND bedroom_id = ?', [$washroomId, $bedroomId]);
        Audit::log('delete_washroom_access', 'space', $washroomId, ['bedroom_id' => $bedroomId]);
    }

    /** Replaces the complete bedroom→washrooms mapping (mirrors old upsert+delete pair in one transaction). */
    public static function setWashroomAccessBulk(string $bedroomId, array $washroomIds): void
    {
        Auth::requirePermission('household.manage');
        $bedroom = Database::row("SELECT kind FROM spaces WHERE id = ?", [$bedroomId]);
        if (!$bedroom || $bedroom['kind'] !== 'bedroom') {
            throw new ApiError(400, 'The linked space needs to be a bedroom');
        }
        foreach ($washroomIds as $washroomId) {
            $washroom = Database::row("SELECT kind FROM spaces WHERE id = ?", [(string) $washroomId]);
            if (!$washroom || $washroom['kind'] !== 'washroom') {
                throw new ApiError(400, 'Each linked space needs to be a washroom');
            }
        }
        Database::beginTransaction();
        try {
            Database::run('DELETE FROM washroom_access WHERE bedroom_id = ?', [$bedroomId]);
            foreach ($washroomIds as $washroomId) {
                Database::run(
                    'INSERT IGNORE INTO washroom_access (washroom_id, bedroom_id) VALUES (?, ?)',
                    [(string) $washroomId, $bedroomId]
                );
            }
            Audit::log('set_washroom_access', 'space', $bedroomId, ['washroom_ids' => array_values($washroomIds)]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function saveGroup(?string $id, array $body): string
    {
        Auth::requirePermission('household.manage');
        $name = Req::text($body, 'name', 120, true);
        $description = Req::text($body, 'description');
        $members = array_values(array_filter(array_map(
            fn ($v) => trim((string) $v),
            is_array($body['members'] ?? null) ? (array) $body['members'] : []
        )));
        Database::beginTransaction();
        try {
            if ($id === null) {
                $id = Uuid::v4();
                Database::run('INSERT INTO household_groups (id, name, description) VALUES (?, ?, ?)',
                    [$id, $name, $description]);
            } else {
                if (!Database::row('SELECT id FROM household_groups WHERE id = ?', [$id])) {
                    throw new ApiError(404, 'Group not found');
                }
                Database::run('UPDATE household_groups SET name = ?, description = ? WHERE id = ?', [$name, $description, $id]);
            }
            foreach ($members as $rid) {
                if (!Uuid::isValid($rid)) {
                    throw new ApiError(400, 'Membership list contains an invalid resident');
                }
                Database::run('INSERT IGNORE INTO group_members (group_id, resident_id) VALUES (?, ?)', [$id, $rid]);
            }
            $all = Database::all('SELECT resident_id FROM group_members WHERE group_id = ?', [$id]);
            foreach ($all as $m) {
                if (!in_array($m['resident_id'], $members, true)) {
                    Database::run('DELETE FROM group_members WHERE group_id = ? AND resident_id = ?', [$id, $m['resident_id']]);
                }
            }
            Audit::log($id ? 'update_group' : 'create_group', 'group', $id, ['name' => $name]);
            Database::commit();
            return $id;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function deleteGroup(string $id): void
    {
        Auth::requirePermission('household.manage');
        $used = Database::row('SELECT id FROM expenses WHERE group_id = ? LIMIT 1', [$id]);
        if ($used) {
            throw new ApiError(409, 'This group has expenses recorded against it and cannot be deleted');
        }
        Database::run('DELETE FROM household_groups WHERE id = ?', [$id]);
        Audit::log('delete_group', 'group', $id);
    }

    /* ------------------------------------------------------ portal roles */

    private static function assertResidentHasAccount(string $residentId): string
    {
        $row = Database::row('SELECT user_id FROM residents WHERE id = ?', [$residentId]);
        if (!$row || !$row['user_id']) {
            throw new ApiError(400, 'Resident has no account yet');
        }
        return (string) $row['user_id'];
    }

    public static function savePortalRole(?string $id, array $body): string
    {
        Auth::requireAdmin();
        $name = Req::text($body, 'name', 60, true);
        if (mb_strlen(trim($name)) < 2) {
            throw new ApiError(400, 'Role name must be at least 2 characters');
        }
        $description = Req::text($body, 'description');
        $allowed = ['household.manage', 'issues.manage', 'audit.read'];
        $permissions = array_values(array_filter(array_map(
            fn ($v) => trim((string) $v),
            is_array($body['permissions'] ?? null) ? (array) $body['permissions'] : []
        )));
        foreach ($permissions as $permission) {
            if (!in_array($permission, $allowed, true)) {
                throw new ApiError(400, 'Unknown permission requested');
            }
        }
        if (in_array(mb_strtolower(trim($name)), ['admin', 'administrator', 'resident'], true)) {
            throw new ApiError(400, 'This role name is reserved');
        }
        Database::beginTransaction();
        try {
            $dup = Database::row('SELECT id FROM portal_roles WHERE name = ?' . ($id ? ' AND id <> ?' : ''),
                $id ? [trim($name), $id] : [trim($name)]);
            if ($dup) {
                throw new ApiError(409, 'A role with this name already exists');
            }
            if ($id === null) {
                $id = Uuid::v4();
                Database::run('INSERT INTO portal_roles (id, name, description) VALUES (?, ?, ?)', [$id, trim($name), $description]);
            } else {
                $row = Database::row('SELECT id FROM portal_roles WHERE id = ?', [$id]);
                if (!$row) {
                    throw new ApiError(404, 'Role not found');
                }
                Database::run('UPDATE portal_roles SET name = ?, description = ? WHERE id = ?',
                    [trim($name), $description, $id]);
                Database::run('DELETE FROM portal_role_permissions WHERE role_id = ?', [$id]);
            }
            foreach ($permissions as $permission) {
                Database::run('INSERT INTO portal_role_permissions (role_id, permission) VALUES (?, ?)', [$id, $permission]);
            }
            Audit::log('save_role', 'role', $id, ['name' => $name, 'permissions' => $permissions]);
            Database::commit();
            return $id;
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function assignPortalRoles(string $residentId, array $roles): void
    {
        Auth::requireAdmin();
        $userId = self::assertResidentHasAccount($residentId);
        Database::beginTransaction();
        try {
            foreach ($roles as $roleId) {
                if (!Uuid::isValid((string) $roleId)
                    || !Database::row('SELECT id FROM portal_roles WHERE id = ?', [(string) $roleId])) {
                    throw new ApiError(400, 'One of the roles does not exist');
                }
            }
            Database::run('DELETE FROM portal_role_members WHERE user_id = ?', [$userId]);
            foreach (array_unique($roles) as $roleId) {
                Database::run('INSERT INTO portal_role_members (role_id, user_id) VALUES (?, ?)', [(string) $roleId, $userId]);
            }
            Audit::log('assign_roles', 'resident', $residentId, ['roles' => array_values($roles)]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function deletePortalRole(string $id): void
    {
        Auth::requireAdmin();
        Database::run('DELETE FROM portal_roles WHERE id = ?', [$id]);
        Audit::log('delete_role', 'role', $id);
    }

    public static function setAdmin(string $residentId, bool $makeAdmin): void
    {
        Auth::requireAdmin();
        $userId = self::assertResidentHasAccount($residentId);
        if ($makeAdmin) {
            Database::run('INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [Uuid::v4(), $userId, 'admin']);
        } else {
            if ($userId === (Auth::$user['id'] ?? '')) {
                throw new ApiError(400, 'You cannot remove your own admin role');
            }
            Database::run("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", [$userId]);
        }
        Audit::log($makeAdmin ? 'grant_admin' : 'revoke_admin', 'resident', $residentId, []);
    }
}
