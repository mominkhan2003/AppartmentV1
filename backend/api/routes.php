<?php
declare(strict_types=1);

/**
 * Route table for backend/api/index.php.
 * Path placeholders: :id  Any endpoint marked "auth:" enforces session; admin-only endpoints call
 * Auth::requireAdmin() — the frontend cannot bypass this.
 */
final class Routes
{
    private static ?array $routes = null;

    /** @return array<int,array{method:string,segments:string[],handler:callable}> */
    public static function all(): array
    {
        if (self::$routes !== null) {
            return self::$routes;
        }
        $r = [];
        $add = function (string $method, string $path, callable $handler) use (&$r): void {
            $segments = array_values(array_filter(explode('/', trim($path, '/')), fn ($s) => $s !== ''));
            $r[] = ['method' => $method, 'segments' => $segments, 'handler' => $handler];
        };

        /* ------------------------------------------------------------- auth */
        $add('POST', '/auth/login', function (array $p, array $q, array $cfg): void {
            $body = Http::body();
            $session = Auth::login((string) ($body['email'] ?? ''), (string) ($body['password'] ?? ''));
            unset($session['token']);
            Http::json(200, $session);
        });
        $add('POST', '/auth/signup', function (array $p, array $q, array $cfg): void {
            $body = Http::body();
            $session = Auth::signup((string) ($body['email'] ?? ''), (string) ($body['password'] ?? ''), trim((string) ($body['display_name'] ?? '')));
            unset($session['token']);
            Http::json(200, $session);
        });
        $add('POST', '/auth/logout', function (): void {
            Auth::logout();
            Http::json(200, ['ok' => true]);
        });
        $add('GET', '/auth/me', function (): void {
            Http::json(200, Repositories::me());
        });
        $add('POST', '/auth/change-password', function (): void {
            $body = Http::body();
            Auth::changePassword((string) ($body['current_password'] ?? ''), (string) ($body['new_password'] ?? ''));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/auth/change-email', function (): void {
            $body = Http::body();
            Auth::changeEmail((string) ($body['new_email'] ?? ''), (string) ($body['current_password'] ?? ''));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/auth/request-password-reset', function (array $p, array $q, array $cfg): void {
            $body = Http::body();
            $result = Auth::requestPasswordReset((string) ($body['email'] ?? ''));
            // no leak: the response never reveals whether the address exists
            $message = $result === 'SENT' ? 'If an account exists, a password reset link has been sent.' : null;
            Http::json(200, [
                'message' => $message,
                'mode' => $result,
                'dev_token' => ($result === 'MAIL_DISABLED' && !empty($cfg['app_debug'])) ? Auth::lastResetToken() : null,
            ]);
        });
        $add('POST', '/auth/reset-password', function (): void {
            $body = Http::body();
            Auth::resetPassword((string) ($body['token'] ?? ''), (string) ($body['new_password'] ?? ''));
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------------ me/ledger */
        $add('GET', '/me', function (): void {
            Http::json(200, Repositories::me());
        });
        $add('GET', '/residents', function (): void {
            Auth::requireLogin();
            Http::json(200, Repositories::residents());
        });
        $add('POST', '/residents', function (): void {
            $id = Services::upsertResident(null, Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/residents/:id', function (array $p): void {
            $id = Services::upsertResident((string) $p['id'], Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/residents/:id', function (array $p): void {
            Services::deleteResident((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('GET', '/balances', function (): void {
            Http::json(200, Repositories::residentBalances());
        });
        $add('GET', '/pool', function (): void {
            Http::json(200, Repositories::poolOverview());
        });
        $add('GET', '/finance/overview', function (): void {
            Http::json(200, Repositories::financeOverview());
        });
        $add('GET', '/financial-report', function (): void {
            Http::json(200, Repositories::financialReport());
        });
        $add('POST', '/finance/rounds', function (): void {
            Http::json(200, Services::startContributionRound(Http::body()));
        });
        $add('GET', '/ledger/:id', function (array $p): void {
            Http::json(200, Repositories::ledger((string) $p['id']));
        });

        /* --------------------------------------------------------- weekly meal plan */
        $add('GET', '/mealplan', function (array $p, array $q): void {
            $week = date('Y-m-d', strtotime(Req::date($q, 'week') ?? date('Y-m-d')));
            $days = ((int) date('N', strtotime($week))) - 1; // snap to that week's Monday
            $week = date('Y-m-d', strtotime("-$days days", strtotime($week)));
            Http::json(200, ['week_start' => $week, 'items' => Repositories::mealPlan($week)]);
        });
        $add('PUT', '/mealplan', function (): void {
            Services::saveMealCell(Http::body());
            Http::json(200, ['ok' => true]);
        });
        $add('DELETE', '/mealplan', function (array $p, array $q): void {
            $week = date('Y-m-d', strtotime(Req::date($q, 'week') ?? date('Y-m-d')));
            $days = ((int) date('N', strtotime($week))) - 1;
            $week = date('Y-m-d', strtotime("-$days days", strtotime($week)));
            $day = (int) ($q['day'] ?? 0);
            $meal = in_array(($q['meal'] ?? ''), ['breakfast', 'lunch', 'dinner'], true) ? (string) $q['meal'] : '';
            if ($meal === '') {
                throw new ApiError(400, 'Unknown meal');
            }
            Services::deleteMealCell($week, $day, $meal);
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------------- spaces */
        $add('GET', '/spaces', function (): void {
            Auth::requireLogin();
            Http::json(200, Repositories::spaces());
        });
        $add('POST', '/spaces', function (): void {
            $id = Services::saveSpace(null, Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/spaces/:id', function (array $p): void {
            $id = Services::saveSpace((string) $p['id'], Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/spaces/:id', function (array $p): void {
            Services::deleteSpace((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('GET', '/washroom-access', function (): void {
            Auth::requireLogin();
            Http::json(200, Repositories::washroomAccess());
        });
        $add('PUT', '/washroom-access', function (): void {
            Services::setWashroomAccess(Http::body());
            Http::json(200, ['ok' => true]);
        });
        $add('PUT', '/washroom-access/bulk', function (): void {
            $body = Http::body();
            $bedroomId = Req::spaceId($body, 'bedroom_id', true);
            $ids = array_values(array_filter(array_map(
                fn ($v) => trim((string) $v),
                is_array($body['washroom_ids'] ?? null) ? (array) $body['washroom_ids'] : []
            )));
            Services::setWashroomAccessBulk((string) $bedroomId, $ids);
            Http::json(200, ['ok' => true]);
        });
        $add('DELETE', '/washroom-access/:washroom/:bedroom', function (array $p): void {
            Services::deleteWashroomAccess((string) $p['washroom'], (string) $p['bedroom']);
            Http::json(200, ['ok' => true]);
        });

        /* -------------------------------------------------------------- groups */
        $add('GET', '/groups', function (): void {
            Auth::requireLogin();
            Http::json(200, Repositories::groupsWithMembers());
        });
        $add('POST', '/groups', function (): void {
            $id = Services::saveGroup(null, Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/groups/:id', function (array $p): void {
            $id = Services::saveGroup((string) $p['id'], Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/groups/:id', function (array $p): void {
            Services::deleteGroup((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------------ expenses */
        $add('GET', '/expenses', function (): void {
            Http::json(200, Repositories::expensesOverview());
        });
        $add('GET', '/expense-shares', function (): void {
            Http::json(200, Repositories::expenseShares());
        });
        $add('POST', '/expenses/claim', function (): void {
            $id = Services::submitClaim(Http::formOrJson());
            Http::json(200, ['id' => $id]);
        });
        $add('POST', '/expenses/shared', function (): void {
            $body = Http::formOrJson();
            $id = Services::recordSharedExpense($body);
            Http::json(200, ['id' => $id]);
        });
        $add('POST', '/expenses/:id/review', function (array $p): void {
            $body = Http::body();
            Services::reviewClaim((string) $p['id'], Req::bool($body, 'approve'), Req::text($body, 'note', 2000));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/expenses/:id/void', function (array $p): void {
            $body = Http::body();
            Services::voidExpense((string) $p['id'], (string) ($body['reason'] ?? ''));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/payments', function (): void {
            $body = Http::body();
            $residentId = Req::uuid($body, 'resident_id', true);
            $amount = Req::int($body, 'amount_cents', true);
            Services::recordPayment($residentId, (int) $amount, Req::text($body, 'note', 500));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/adjustments', function (): void {
            $body = Http::body();
            $residentId = Req::uuid($body, 'resident_id', true);
            $amount = Req::int($body, 'amount_cents', true);
            Services::addAdjustment($residentId, (int) $amount, (string) ($body['reason'] ?? ''));
            Http::json(200, ['ok' => true]);
        });

        /* -------------------------------------------------------------- chores */
        $add('GET', '/chores', function (): void {
            Auth::requireLogin();
            Http::json(200, Repositories::choreList());
        });
        $add('GET', '/chore-events', function (): void {
            Http::json(200, Repositories::choreEvents());
        });
        $add('POST', '/chores', function (): void {
            $id = Services::saveChore(null, Http::formOrJson());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/chores/:id', function (array $p): void {
            $id = Services::saveChore((string) $p['id'], Http::formOrJson());
            Http::json(200, ['id' => $id]);
        });
        $add('POST', '/chores/:id/complete', function (array $p): void {
            $body = Http::formOrJson();
            Services::completeChore((string) $p['id'], Req::text($body, 'note', 500));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/chores/:id/report-needed', function (array $p): void {
            $body = Http::body();
            Services::reportChoreNeeded((string) $p['id'], Req::text($body, 'note', 500));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/chores/:id/admin-action', function (array $p): void {
            $body = Http::body();
            $action = Req::enum($body, 'action', ['skip', 'reassign', 'reset'], true);
            Services::choreAdminAction((string) $p['id'], (string) $action, Req::uuid($body, 'target'), (string) ($body['reason'] ?? ''));
            Http::json(200, ['ok' => true]);
        });

        /* -------------------------------------------------------------- issues */
        $add('GET', '/issues', function (): void {
            Http::json(200, Repositories::issues());
        });
        $add('POST', '/issues', function (): void {
            $id = Services::createIssue(Http::formOrJson());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/issues/:id', function (array $p): void {
            Services::updateIssue((string) $p['id'], Http::body());
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------------ hub pages */
        $add('GET', '/hub/items', function (array $p, array $q): void {
            $kind = trim((string) ($q['kind'] ?? ''));
            if (!in_array($kind, ['shopping', 'notices', 'events', 'bookings', 'polls', 'inventory', 'documents', 'contacts', 'rules', 'lost-found'], true)) {
                throw new ApiError(400, 'Unknown hub kind');
            }
            Http::json(200, Repositories::hubItems($kind));
        });
        $add('GET', '/hub/responses', function (array $p, array $q): void {
            $kind = trim((string) ($q['kind'] ?? ''));
            if (!in_array($kind, ['shopping', 'notices', 'events', 'bookings', 'polls', 'inventory', 'documents', 'contacts', 'rules', 'lost-found'], true)) {
                throw new ApiError(400, 'Unknown hub kind');
            }
            Http::json(200, Repositories::hubResponses($kind));
        });
        $add('POST', '/hub/items', function (): void {
            require __DIR__ . '/hub.php';
            $id = Hub::insertItem(Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/hub/items/:id', function (array $p): void {
            require __DIR__ . '/hub.php';
            Hub::editItem((string) $p['id'], Http::body());
            Http::json(200, ['ok' => true]);
        });
        $add('DELETE', '/hub/items/:id', function (array $p): void {
            require __DIR__ . '/hub.php';
            Hub::deleteItem((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/hub/respond', function (): void {
            require __DIR__ . '/hub.php';
            $body = Http::body();
            Hub::respond((string) ($body['item_id'] ?? ''), (string) ($body['value'] ?? ''));
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/hub/status', function (): void {
            require __DIR__ . '/hub.php';
            $body = Http::body();
            Hub::setStatus((string) ($body['item_id'] ?? ''), (string) ($body['status'] ?? ''));
            Http::json(200, ['ok' => true]);
        });

        /* -------------------------------------------------------- portal roles */
        $add('GET', '/portal-roles', function (): void {
            Http::json(200, [
                'roles' => Repositories::portalRoles(),
                'members' => Repositories::portalRoleMembers(),
                'admins' => Repositories::adminResidentIds(),
            ]);
        });
        $add('POST', '/portal-roles', function (): void {
            $id = Services::savePortalRole(null, Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/portal-roles/:id', function (array $p): void {
            $id = Services::savePortalRole((string) $p['id'], Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/portal-roles/:id', function (array $p): void {
            Services::deletePortalRole((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/residents/:id/roles', function (array $p): void {
            $body = Http::body();
            $roles = array_values(array_filter(array_map('strval', is_array($body['roles'] ?? null) ? $body['roles'] : [])));
            Services::assignPortalRoles((string) $p['id'], $roles);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/residents/:id/admin', function (array $p): void {
            $body = Http::body();
            Services::setAdmin((string) $p['id'], Req::bool($body, 'make_admin'));
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------ user accounts */
        $add('GET', '/users', function (): void {
            Http::json(200, Repositories::accounts());
        });
        $add('POST', '/users/:id/approval', function (array $p): void {
            $body = Http::body();
            Services::setUserApproval((string) $p['id'], Req::bool($body, 'approve'));
            Http::json(200, ['ok' => true]);
        });
        $add('DELETE', '/users/:id', function (array $p): void {
            Services::deleteUser((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });

        /* ---------------------------------------------------------------- audit */
        $add('GET', '/audit', function (): void {
            Http::json(200, Repositories::auditRows());
        });

        /* -------------------------------------------------------------- media */
        $add('GET', '/media', function (): void {
            Auth::requireAdmin();
            Http::json(200, Media::listAll());
        });
        $add('POST', '/media', function (): void {
            $bucket = in_array($_GET['bucket'] ?? '', ['media', 'receipts', 'photos', 'social'], true) ? (string) $_GET['bucket'] : 'media';
            // Website graphics and social artwork are admin uploads; residents may add receipts,
            // chore proof and issue photos (the storage policies the old Supabase buckets had).
            if ($bucket === 'media' || $bucket === 'social') {
                Auth::requireAdmin();
            } else {
                Auth::requireLogin();
            }
            $allowed = $bucket === 'receipts'
                ? ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
                : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            $row = Media::store($bucket, $allowed);
            Http::json(201, $row);
        });
        $add('PATCH', '/media/:id', function (array $p): void {
            Http::json(200, Media::updateMeta((string) $p['id'], Http::body()));
        });
        $add('PUT', '/media/:id/replace', function (array $p): void {
            Media::replace((string) $p['id'], ['image/jpeg', 'image/png', 'image/webp']);
            Http::json(200, ['ok' => true]);
        });
        $add('DELETE', '/media/:id', function (array $p): void {
            Media::delete((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('GET', '/media/:id/file', function (array $p): never {
            Media::serve((string) $p['id']);
        });

        /* ------------------------------------------------------ notifications */
        $add('GET', '/notifications', function (): void {
            Http::json(200, ['items' => Repositories::notifications(), 'unread' => Repositories::unreadNotificationCount()]);
        });
        $add('POST', '/notifications/read', function (): void {
            Auth::requireLogin();
            $body = Http::body();
            $id = trim((string) ($body['notification_id'] ?? ''));
            if ($id === '') {
                Database::run(
                    'INSERT IGNORE INTO notification_reads (notification_id, user_id)
                     SELECT n.id, ? FROM notifications n WHERE (n.audience = \'user\' AND n.user_id = ?) OR (n.audience = \'admin\' AND 1=?)',
                    [Auth::$user['id'], Auth::$user['id'], Auth::$isAdmin ? 1 : 0]
                );
            } elseif (Uuid::isValid($id)) {
                Database::run('INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
                    [$id, Auth::$user['id']]);
            }
            Http::json(200, ['ok' => true]);
        });

        /* ------------------------------------------------------------ donations */
        $add('GET', '/donations/summary', function (): void {
            Http::json(200, ServicesCmsDonations::publicSummary());
        });
        $add('GET', '/donations/categories', function (): void {
            Auth::requireLogin();
            Http::json(200, ServicesCmsDonations::categories());
        });
        $add('GET', '/public/donation-categories', function (): void {
            Http::json(200, ServicesCmsDonations::publicCategories());
        });
        $add('POST', '/public/donation-requests', function (): void {
            Http::json(201, ServicesCmsDonations::createRequest(Http::body()));
        });
        $add('GET', '/donation-requests', function (): void {
            Http::json(200, ServicesCmsDonations::listRequests());
        });
        $add('PATCH', '/donation-requests/:id', function (array $p): void {
            Http::json(200, ServicesCmsDonations::updateRequest((string) $p['id'], Http::body()));
        });
        $add('GET', '/donation-transactions', function (): void {
            Http::json(200, ServicesCmsDonations::listTransactions());
        });
        $add('POST', '/donation-transactions', function (): void {
            Http::json(201, ServicesCmsDonations::createTransaction(Http::body()));
        });
        $add('DELETE', '/donation-transactions/:id', function (array $p): void {
            ServicesCmsDonations::deleteTransaction((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/donation-categories', function (): void {
            $id = ServicesCmsDonations::saveCategory(null, Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('PATCH', '/donation-categories/:id', function (array $p): void {
            $id = ServicesCmsDonations::saveCategory((string) $p['id'], Http::body());
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/donation-categories/:id', function (array $p): void {
            ServicesCmsDonations::deleteCategory((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });

        /* ---------------------------------------------------------- site content */
        $add('GET', '/public/homepage', function (): void {
            header('Cache-Control: public, max-age=60');
            Http::json(200, ServicesCmsContent::homepage());
        });
        $add('GET', '/site-content', function (): void {
            Http::json(200, ['sections' => ServicesCmsContent::adminSections(), 'translations' => ServicesCmsContent::adminTranslations()]);
        });
        $add('PATCH', '/site-content/:code', function (array $p): void {
            Http::json(200, ServicesCmsContent::saveSection((string) $p['code'], Http::body()));
        });
        $add('POST', '/site-content/reorder', function (): void {
            ServicesCmsContent::reorderSections(Http::body());
            Http::json(200, ['ok' => true]);
        });
        $add('GET', '/site-settings', function (): void {
            Http::json(200, ServicesCmsContent::adminSettings());
        });
        $add('PUT', '/site-settings', function (): void {
            ServicesCmsContent::saveSettings(Http::body());
            Http::json(200, ['ok' => true]);
        });

        /* ---------------------------------------------------------------- events */
        $add('GET', '/public/events', function (): void {
            header('Cache-Control: public, max-age=60');
            $rows = Database::all(
                'SELECT e.*, t.locale, t.title, t.description FROM events e
                  LEFT JOIN event_translations t ON t.event_id = e.id
                 WHERE e.status = \'published\'
                 ORDER BY e.starts_at LIMIT 50'
            );
            Http::json(200, $rows);
        });
        $add('GET', '/events', function (array $p, array $q): void {
            Http::json(200, ServicesCms::listEvents($q));
        });
        $add('GET', '/events/:id', function (array $p): void {
            Auth::requireLogin();
            $row = Database::row('SELECT * FROM events WHERE id = ?', [(string) $p['id']]);
            if (!$row) {
                throw new ApiError(404, 'Event not found');
            }
            if ($row['status'] !== 'published' && !Auth::$isAdmin) {
                throw new ApiError(404, 'Event not found');
            }
            Http::json(200, ServicesCms::eventPayload($row));
        });
        $add('POST', '/events', function (): void {
            Http::json(201, ServicesCms::saveEvent(null, Http::body()));
        });
        $add('PATCH', '/events/:id', function (array $p): void {
            Http::json(200, ServicesCms::saveEvent((string) $p['id'], Http::body()));
        });
        $add('POST', '/events/:id/duplicate', function (array $p): void {
            Http::json(201, ServicesCms::duplicateEvent((string) $p['id']));
        });
        $add('POST', '/events/:id/status', function (array $p): void {
            $body = Http::body();
            Http::json(200, ServicesCms::transitionEvent((string) $p['id'],
                Req::enum($body, 'status', ['draft', 'published', 'archived'], true)));
        });
        $add('DELETE', '/events/:id', function (array $p): void {
            ServicesCms::deleteEvent((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/events/:id/shifts', function (array $p): void {
            $body = Http::body();
            $body['event_id'] = (string) $p['id'];
            $id = ServicesCms::saveShift(null, $body);
            Http::json(201, ['id' => $id]);
        });
        $add('PATCH', '/shifts/:id', function (array $p): void {
            $body = Http::body();
            unset($body['event_id']);
            $id = ServicesCms::saveShift((string) $p['id'], $body);
            Http::json(200, ['id' => $id]);
        });
        $add('DELETE', '/shifts/:id', function (array $p): void {
            ServicesCms::deleteShift((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });
        $add('POST', '/shifts/:id/assignments', function (array $p): void {
            Http::json(200, ['assignments' => ServicesCms::assignShift((string) $p['id'], Http::body())]);
        });
        $add('POST', '/shifts/:id/decline', function (array $p): void {
            ServicesCms::declineShift((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });

        /* ----------------------------------------------------------- social posts */
        $add('GET', '/social/studio', function (): void {
            Http::json(200, ServicesCmsSocial::studioMeta());
        });
        $add('GET', '/social-posts', function (): void {
            Http::json(200, ServicesCmsSocial::listPosts());
        });
        $add('POST', '/social-posts', function (): void {
            Http::json(201, ServicesCmsSocial::createPost());
        });
        $add('DELETE', '/social-posts/:id', function (array $p): void {
            ServicesCmsSocial::deletePost((string) $p['id']);
            Http::json(200, ['ok' => true]);
        });

        self::$routes = $r;
        return $r;
    }
}
