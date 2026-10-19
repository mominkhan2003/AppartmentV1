<?php
declare(strict_types=1);

/** Social-media post studio storage: exported branded graphics + captions. */
final class ServicesCmsSocial
{
    public static function listPosts(): array
    {
        Auth::requireLogin();
        return Database::all(
            'SELECT sp.*, m.mime_type, m.width, m.height,
                    (SELECT GROUP_CONCAT(CONCAT(spt.locale, ": ", spt.caption) SEPARATOR " | ")
                       FROM social_post_translations spt WHERE spt.post_id = sp.id) AS captions
               FROM social_posts sp LEFT JOIN media_assets m ON m.id = sp.media_id
              ORDER BY sp.created_at DESC LIMIT 100'
        );
    }

    /** Multipart request: exported PNG/JPEG bytes + metadata + per-locale captions. */
    public static function createPost(): array
    {
        Auth::requireAdmin();
        $body = Http::formOrJson();
        $format = Req::enum($body, 'format', ['square', 'portrait', 'story']) ?? 'square';
        $template = Req::text($body, 'template', 40) ?? 'default';
        if (!preg_match('/^[a-z0-9_-]{1,40}$/', (string) $template)) {
            throw new ApiError(400, 'Unknown template');
        }
        $headline = Req::text($body, 'headline', 120);
        $mediaId = null;
        if (isset($_FILES['file']) && is_array($_FILES['file']) && ($_FILES['file']['size'] ?? 0) > 0) {
            $stored = Media::store('social', ['image/png', 'image/jpeg']);
            $mediaId = (string) $stored['id'];
        }
        if ($mediaId === null) {
            throw new ApiError(400, 'Export the graphic (PNG or JPEG) before saving');
        }
        $id = Uuid::v4();
        Database::beginTransaction();
        try {
            Database::run('INSERT INTO social_posts (id, format, template, headline, media_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                [$id, $format, (string) $template, $headline, $mediaId, Auth::$user['id']]);
            foreach (['de', 'en'] as $locale) {
                if (is_array($body[$locale] ?? null) && isset($body[$locale]['caption'])) {
                    $caption = mb_substr(trim((string) $body[$locale]['caption']), 0, 2200);
                    if ($caption !== '') {
                        Database::run('INSERT INTO social_post_translations (post_id, locale, caption) VALUES (?, ?, ?)',
                            [$id, $locale, $caption]);
                    }
                }
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollBack();
            throw $e;
        }
        Audit::log('create_social_post', 'social_post', $id, ['format' => $format, 'template' => $template]);
        return Database::row('SELECT sp.*, m.mime_type, m.width, m.height FROM social_posts sp
                               LEFT JOIN media_assets m ON m.id = sp.media_id WHERE sp.id = ?', [$id]) ?? [];
    }

    public static function deletePost(string $id): void
    {
        Auth::requireAdmin();
        $row = Database::row('SELECT * FROM social_posts WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Post not found');
        }
        Database::run('DELETE FROM social_posts WHERE id = ?', [$id]);
        if ($row['media_id']) {
            Media::delete((string) $row['media_id']);
        }
        Audit::log('delete_social_post', 'social_post', $id);
    }

    /** Studio metadata delivered to the frontend (formats, templates, brand colors live in code). */
    public static function studioMeta(): array
    {
        return [
            'formats' => [
                ['id' => 'square', 'name' => 'Instagram square', 'width' => 1080, 'height' => 1080],
                ['id' => 'portrait', 'name' => 'Instagram portrait', 'width' => 1080, 'height' => 1350],
                ['id' => 'story', 'name' => 'Story', 'width' => 1080, 'height' => 1920],
            ],
            'templates' => [
                ['id' => 'hero-solid', 'name' => 'Solid hero'],
                ['id' => 'hero-split', 'name' => 'Image + headline'],
                ['id' => 'quote', 'name' => 'Quote'],
                ['id' => 'event', 'name' => 'Event announcement'],
            ],
        ];
    }
}
