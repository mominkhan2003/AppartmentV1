<?php
declare(strict_types=1);

/** Site content (homepage sections / nav / footer / donations copy) + settings. */
final class ServicesCmsContent
{
    /** Public homepage payload: visible sections (all locales), upcoming published events, public impact stats. */
    public static function homepage(): array
    {
        $sections = Database::all(
            "SELECT s.*, st.locale, st.heading, st.subheading, st.body, m.mime_type AS media_mime, m.file_path AS media_file, m.alt_text AS media_alt
              FROM site_sections s
              LEFT JOIN site_section_translations st ON st.section_code = s.code
              LEFT JOIN media_assets m ON m.id = s.media_id
              WHERE s.area IN ('home','footer','nav','donations') AND s.visible = 1
              ORDER BY s.area, s.sort"
        );
        $grouped = [];
        foreach ($sections as $r) {
            $code = (string) $r['code'];
            if (!isset($grouped[$code])) {
                $grouped[$code] = [
                    'code' => $code, 'area' => $r['area'], 'kind' => $r['kind'], 'icon' => $r['icon'],
                    'sort' => (int) $r['sort'], 'visible' => true,
                    'media_id' => $r['media_id'], 'media_position' => $r['media_position'],
                    'cta_label' => $r['cta_label'], 'cta_href' => $r['cta_href'],
                    'cta2_label' => $r['cta2_label'], 'cta2_href' => $r['cta2_href'],
                    'media' => $r['media_id'] ? ['mime' => $r['media_mime'], 'alt' => $r['media_alt']] : null,
                    'translations' => [],
                ];
            }
            if ($r['locale']) {
                $grouped[$code]['translations'][$r['locale']] = [
                    'heading' => $r['heading'], 'subheading' => $r['subheading'], 'body' => $r['body'],
                ];
            }
        }
        $events = Database::all(
            'SELECT e.id, e.slug, e.starts_at, e.ends_at, e.meeting_point, e.address, e.category, e.cover_media_id, e.additional_info,
                    t.locale, t.title, t.description
               FROM events e
               LEFT JOIN event_translations t ON t.event_id = e.id
              WHERE e.status = \'published\' AND e.starts_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 HOUR)
              ORDER BY e.starts_at LIMIT 9'
        );
        $donationSummary = ServicesCmsDonations::publicSummary();
        $settings = self::publicSettings();
        return [
            'sections' => array_values($grouped),
            'events' => $events,
            'impact' => $donationSummary,
            'settings' => $settings,
        ];
    }

    public static function publicSettings(): array
    {
        $rows = Database::all(
            "SELECT setting_key, setting_value FROM site_settings
              WHERE setting_key IN ('site_name','default_locale','social_instagram_url','donations_public','donations_goal','donations_account','donations_instructions')"
        );
        $out = [];
        foreach ($rows as $r) {
            $out[$r['setting_key']] = $r['setting_value'] === '1' && $r['setting_key'] === 'donations_public'
                ? true : $r['setting_value'];
        }
        return $out;
    }

    /** Admin view: every section incl. hidden ones + all translations. */
    public static function adminSections(): array
    {
        Auth::requireAdmin();
        return Database::all(
            "SELECT s.*, m.file_path AS media_file
              FROM site_sections s LEFT JOIN media_assets m ON m.id = s.media_id
              ORDER BY s.area, s.sort"
        );
    }

    public static function adminTranslations(): array
    {
        Auth::requireAdmin();
        return Database::all('SELECT * FROM site_section_translations');
    }

    /** Upserts parent row facts + per-locale translations provided in the body. */
    public static function saveSection(string $code, array $body): array
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM site_sections WHERE code = ?', [$code]);
        if (!$row) {
            throw new ApiError(404, 'Section not found');
        }
        $sets = []; $params = [];
        $fmap = [
            'icon' => 'icon', 'media_id' => 'media_id', 'media_position' => 'media_position',
            'cta_label' => 'cta_label', 'cta_href' => 'cta_href', 'cta2_label' => 'cta2_label', 'cta2_href' => 'cta2_href',
        ];
        $ctaMax = ['cta_label' => 120, 'cta_href' => 500, 'cta2_label' => 120, 'cta2_href' => 500, 'icon' => 40];
        foreach ($fmap as $key => $col) {
            if (!array_key_exists($key, $body)) {
                continue;
            }
            $sets[] = "$col = ?";
            $params[] = $key === 'media_id' ? Req::uuid($body, $key) : Req::text($body, $key, $ctaMax[$key] ?? 255);
        }
        if (array_key_exists('visible', $body)) {
            $sets[] = 'visible = ?'; $params[] = Req::bool($body, 'visible') ? 1 : 0;
        }
        if (array_key_exists('sort', $body)) {
            $sets[] = 'sort = ?'; $params[] = max(0, Req::int($body, 'sort') ?? 0);
        }
        if (array_key_exists('media_id', $body) && Req::uuid($body, 'media_id') !== null && !Media::row((string) Req::uuid($body, 'media_id'))) {
            throw new ApiError(400, 'Media asset not found');
        }
        if ($sets) {
            $params[] = Auth::$user['id'];
            $params[] = $code;
            Database::run('UPDATE site_sections SET ' . implode(', ', $sets) . ', updated_by = ? WHERE code = ?', $params);
        }
        foreach (['de', 'en'] as $locale) {
            if (!is_array($body[$locale] ?? null)) {
                continue;
            }
            $t = (array) $body[$locale];
            $heading = isset($t['heading']) ? mb_substr(trim((string) $t['heading']), 0, 300) : null;
            $subheading = isset($t['subheading']) ? mb_substr(trim((string) $t['subheading']), 0, 300) : null;
            $bodyText = isset($t['body']) ? mb_substr(trim((string) $t['body']), 0, 2000) : null;
            if ($heading === null && $subheading === null && $bodyText === null) {
                continue;
            }
            Database::run(
                'INSERT INTO site_section_translations (section_code, locale, heading, subheading, body) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE heading = IF(? IS NULL, heading, ?), subheading = IF(? IS NULL, subheading, ?), body = IF(? IS NULL, body, ?)',
                [$code, $locale, $heading, $subheading, $bodyText, $heading, $heading, $subheading, $subheading, $bodyText, $bodyText]
            );
        }
        Audit::log('save_site_section', 'site_section', $code, ['fields' => array_keys($body)]);
        return Database::row('SELECT * FROM site_sections WHERE code = ?', [$code]) ?? [];
    }

    /** Section ordering inside one area (drag & drop reorder support). */
    public static function reorderSections(array $body): void
    {
        Auth::requireAdmin();
        $codes = is_array($body['codes'] ?? null) ? (array) $body['codes'] : [];
        $area = Req::text($body, 'area', 20);
        Database::beginTransaction();
        try {
            foreach (array_values($codes) as $sort => $code) {
                if ($code === '' || strlen($code) > 60) {
                    continue;
                }
                Database::run('UPDATE site_sections SET sort = ? WHERE code = ?' . ($area ? ' AND area = ?' : ''),
                    $area ? [(int) $sort, $code, $area] : [(int) $sort, $code]);
            }
            Audit::log('reorder_site_sections', 'site_section', null, ['codes' => $codes]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }

    public static function adminSettings(): array
    {
        Auth::requireAdmin();
        return Database::all('SELECT setting_key, setting_value, updated_at FROM site_settings ORDER BY setting_key');
    }

    public static function saveSettings(array $body): void
    {
        Auth::requireAdmin();
        Database::beginTransaction();
        try {
            $keys = [];
            foreach ($body as $key => $value) {
                $key = trim((string) $key);
                $keys[] = $key;
                if (!preg_match('/^[a-z][a-z0-9_]{0,58}$/', $key)) {
                    throw new ApiError(400, 'Invalid setting name');
                }
                if (!is_string($value)) {
                    $value = is_bool($value) ? ($value ? '1' : '0') : (string) $value;
                }
                if (strlen($value) > 2000) {
                    throw new ApiError(400, 'Setting value too long');
                }
                Database::run(
                    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                    [$key, $value]
                );
            }
            Audit::log('save_settings', 'site_settings', null, ['keys' => $keys]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
    }
}
