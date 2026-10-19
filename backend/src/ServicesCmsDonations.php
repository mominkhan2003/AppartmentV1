<?php
declare(strict_types=1);

/** Donation requests + confirmed transactions + privacy-aware public summary. */
final class ServicesCmsDonations
{
    /* --------------------------------------------------- public form (rate limited) */

    public static function createRequest(array $body): array
    {
        // Public endpoint: throttled by IP, no auth required.
        $ip = Http::ip();
        if ($ip !== 'unknown') {
            $row = Database::row(
                'SELECT COUNT(*) AS n FROM donation_requests WHERE request_ip = ? AND created_at > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)',
                [$ip]
            );
            if ((int) ($row['n'] ?? 0) >= 10) {
                throw new ApiError(429, 'Too many requests. Please try again later');
            }
        }
        $name = Req::text($body, 'contact_name', 120, true);
        $email = Req::text($body, 'contact_email', null, true);
        if (!filter_var((string) $email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(400, 'Enter a valid email address');
        }
        $phone = Req::text($body, 'contact_phone', 40);
        $amount = Req::centsFrom($body, 'amount_cents'); // optional
        $categoryId = Req::uuid($body, 'category_id');
        if ($categoryId !== null && !Database::row('SELECT id FROM donation_categories WHERE id = ?', [$categoryId])) {
            throw new ApiError(400, 'Category not found');
        }
        $message = Req::text($body, 'message', 2000);
        $id = Uuid::v4();
        Database::run(
            "INSERT INTO donation_requests (id, contact_name, contact_email, contact_phone, amount_cents, category_id, message, status, request_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)",
            [$id, $name, $email, $phone, $amount, $categoryId, $message, $ip]
        );
        Services::notifyAdmins(
            'donation_request',
            'New donation request from ' . $name,
            $amount !== null ? 'Offered ' . number_format($amount / 100, 2, ',', ' ') . ' EUR' : 'No amount given',
            '/donations'
        );
        if (Auth::$user !== null) {
            Audit::log('create_donation_request', 'donation_request', $id);
        }
        return ['id' => $id, 'status' => 'received'];
    }

    private static function mapRequest(array $row): array
    {
        // Only admin endpoints build request payloads (contact data is private).
        $category = $row['category_id'] ? Database::row('SELECT name FROM donation_categories WHERE id = ?', [$row['category_id']]) : null;
        $row['category_name'] = $category['name'] ?? null;
        return $row;
    }

    public static function listRequests(): array
    {
        Auth::requireAdmin();
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int) ($_GET['per_page'] ?? 25)));
        $status = trim((string) ($_GET['status'] ?? ''));
        $where = []; $params = [];
        if ($status !== '' && in_array($status, ['new', 'credited', 'declined', 'spam'], true)) {
            $where[] = 'status = ?'; $params[] = $status;
        }
        $search = trim((string) ($_GET['q'] ?? ''));
        if ($search !== '') {
            $where[] = '(contact_name LIKE ? OR contact_email LIKE ? OR message LIKE ?)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%';
            array_push($params, $like, $like, $like);
        }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $total = (int) (Database::row('SELECT COUNT(*) AS n FROM donation_requests' . $whereSql, $params)['n'] ?? 0);
        $rows = Database::all(
            'SELECT r.*, c.name AS category_name FROM donation_requests r
              LEFT JOIN donation_categories c ON c.id = r.category_id' .
            $whereSql . ' ORDER BY r.created_at DESC LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage),
            $params
        );
        return ['items' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }

    public static function updateRequest(string $id, array $body): array
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM donation_requests WHERE id = ? FOR UPDATE', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Request not found');
        }
        $sets = []; $params = [];
        if (isset($body['status'])) {
            $sets[] = 'status = ?';
            $params[] = Req::enum($body, 'status', ['new', 'credited', 'declined', 'spam'], true);
        }
        if (array_key_exists('internal_notes', $body)) {
            $sets[] = 'internal_notes = ?';
            $params[] = Req::text($body, 'internal_notes', 2000);
        }
        if ($sets) {
            $params[] = $id;
            Database::run('UPDATE donation_requests SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            Audit::log('update_donation_request', 'donation_request', $id, array_intersect_key($body, ['status' => 1, 'internal_notes' => 1]));
        }
        return self::mapRequest(Database::row('SELECT * FROM donation_requests WHERE id = ?', [$id]) ?? []);
    }

    public static function listTransactions(): array
    {
        Auth::requireAdmin();
        $params = [];
        $where = [];
        $from = Req::date($_GET, 'from');
        $to = Req::date($_GET, 'to');
        $categoryId = trim((string) ($_GET['category_id'] ?? ''));
        if ($from) { $where[] = 'transaction_date >= ?'; $params[] = $from; }
        if ($to) { $where[] = 'transaction_date <= ?'; $params[] = $to; }
        if (Uuid::isValid($categoryId)) { $where[] = 'category_id = ?'; $params[] = $categoryId; }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $rows = Database::all(
            'SELECT t.*, c.name AS category_name FROM donation_transactions t
              LEFT JOIN donation_categories c ON c.id = t.category_id
              ' . $whereSql . ' ORDER BY t.transaction_date DESC LIMIT 500',
            $params
        );
        $totals = Database::row(
            'SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS sum FROM donation_transactions' . $whereSql,
            $params
        );
        return [
            'items' => $rows,
            'total' => $totals ? (int) $totals['n'] : 0,
            'sum_amount_cents' => $totals ? (int) $totals['sum'] : 0,
            'filter' => ['from' => $from, 'to' => $to, 'category_id' => Uuid::isValid($categoryId) ? $categoryId : null],
        ];
    }

    public static function createTransaction(array $body): array
    {
        Auth::requireAdmin();
        $amount = Req::positiveInt($body, 'amount_cents', true);
        $date = Req::date($body, 'transaction_date', true);
        $method = Req::enum($body, 'method', ['bank_transfer', 'cash', 'other']) ?? 'bank_transfer';
        $categoryId = Req::uuid($body, 'category_id');
        if ($categoryId !== null && !Database::row('SELECT id FROM donation_categories WHERE id = ?', [$categoryId])) {
            throw new ApiError(400, 'Category not found');
        }
        $requestId = Req::uuid($body, 'request_id');
        Database::beginTransaction();
        try {
            if ($requestId !== null) {
                $request = Database::row('SELECT * FROM donation_requests WHERE id = ? FOR UPDATE', [$requestId]);
                if (!$request) {
                    throw new ApiError(404, 'Linked donation request not found');
                }
            }
            $id = Uuid::v4();
            Database::run(
                'INSERT INTO donation_transactions (id, category_id, amount_cents, transaction_date, method, reference, donor_name, request_id, note, entered_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $categoryId, $amount, $date, $method, Req::text($body, 'reference', 120),
                 Req::text($body, 'donor_name', 120), $requestId, Req::text($body, 'note', 500), Auth::$user['id']]
            );
            if ($requestId !== null) {
                Database::run("UPDATE donation_requests SET status = 'credited' WHERE id = ?", [$requestId]);
            }
            Audit::log('create_donation_transaction', 'donation_transaction', $id, [
                'amount_cents' => $amount, 'request_id' => $requestId,
            ]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
        return Database::row('SELECT * FROM donation_transactions WHERE id = ?', [$id]) ?? [];
    }

    public static function deleteTransaction(string $id): void
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM donation_transactions WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Transaction not found');
        }
        Database::run('DELETE FROM donation_transactions WHERE id = ?', [$id]);
        Audit::log('delete_donation_transaction', 'donation_transaction', $id, ['amount_cents' => $row['amount_cents']]);
    }

    public static function categories(): array
    {
        Auth::requireLogin();
        return Database::all('SELECT * FROM donation_categories ORDER BY sort, name');
    }

    public static function publicCategories(): array
    {
        return Database::all('SELECT id, name, description FROM donation_categories ORDER BY sort, name');
    }

    public static function saveCategory(?string $id, array $body): string
    {
        Auth::requireAdmin();
        $name = Req::text($body, 'name', 80, true);
        $description = Req::text($body, 'description');
        $sort = max(0, Req::int($body, 'sort') ?? 0);
        if ($id === null) {
            $dup = Database::row('SELECT id FROM donation_categories WHERE name = ?', [$name]);
            if ($dup) {
                throw new ApiError(409, 'A category with this name already exists');
            }
            $id = Uuid::v4();
            Database::run('INSERT INTO donation_categories (id, name, description, sort) VALUES (?, ?, ?, ?)',
                [$id, $name, $description, $sort]);
        } else {
            $row = Database::row('SELECT id FROM donation_categories WHERE id = ?', [$id]);
            if (!$row) {
                throw new ApiError(404, 'Category not found');
            }
            Database::run('UPDATE donation_categories SET name = ?, description = ?, sort = ? WHERE id = ?',
                [$name, $description, $sort, $id]);
        }
        Audit::log('save_donation_category', 'donation_category', $id, ['name' => $name]);
        return $id;
    }

    public static function deleteCategory(string $id): void
    {
        Auth::requireAdmin();
        Database::run('DELETE FROM donation_categories WHERE id = ?', [$id]);
        Audit::log('delete_donation_category', 'donation_category', $id);
    }

    /** Privacy-aware public aggregate: totals only, never donor names, e-mail addresses or notes. */
    public static function publicSummary(): array
    {
        $enabled = Database::row("SELECT setting_value FROM site_settings WHERE setting_key = 'donations_public'");
        if ($enabled && $enabled['setting_value'] === '0') {
            return ['enabled' => false];
        }
        $total = Database::row(
            'SELECT COALESCE(SUM(amount_cents),0) AS s, COUNT(*) AS n, COALESCE(SUM(CASE WHEN YEAR(transaction_date)=YEAR(UTC_TIMESTAMP()) THEN amount_cents ELSE 0 END),0) AS this_year
              FROM donation_transactions'
        );
        $months = Database::all(
            'SELECT DATE_FORMAT(transaction_date, "%Y-%m") AS month, SUM(amount_cents) AS amount_cents
              FROM donation_transactions
              WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
              GROUP BY month ORDER BY month'
        );
        $byCategory = Database::all(
            'SELECT c.name, SUM(t.amount_cents) AS amount_cents FROM donation_transactions t
              JOIN donation_categories c ON c.id = t.category_id GROUP BY c.name ORDER BY amount_cents DESC'
        );
        $goal = Database::row("SELECT setting_value FROM site_settings WHERE setting_key = 'donations_goal'");
        return [
            'enabled' => true,
            'total_amount_cents' => (int) ($total['s'] ?? 0),
            'total_count' => (int) ($total['n'] ?? 0),
            'this_year_amount_cents' => (int) ($total['this_year'] ?? 0),
            'goal_cents' => $goal && $goal['setting_value'] !== '' ? (int) $goal['setting_value'] : null,
            'months' => array_map(fn ($m) => ['month' => $m['month'], 'amount_cents' => (int) $m['amount_cents']], $months),
            'by_category' => array_map(fn ($c) => ['name' => $c['name'], 'amount_cents' => (int) $c['amount_cents']], $byCategory),
        ];
    }
}
