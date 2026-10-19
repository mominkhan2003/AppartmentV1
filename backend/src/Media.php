<?php
declare(strict_types=1);

/**
 * Media library + file storage. Replaces Supabase Storage buckets (receipts/photos) and adds
 * a managed media library for the CMS (event covers/galleries, hero images, social exports).
 * Files live on disk under the configured uploads directory; MySQL stores metadata only.
 */
final class Media
{
    private static string $uploadsDir = '';
    private static array $config = [];

    private const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same limit the frontend used before

    private const MIME_TO_EXT = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
        'image/gif' => 'gif', 'application/pdf' => 'pdf',
    ];

    public static function configure(array $config): void
    {
        self::$config = $config;
        $configured = $config['uploads_dir'] ?? null;
        self::$uploadsDir = is_string($configured) && $configured !== ''
            ? rtrim($configured, '/\\')
            : dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
        if (!is_dir(self::$uploadsDir)) {
            @mkdir(self::$uploadsDir, 0775, true);
        }
    }

    public static function uploadsDir(): string
    {
        return self::$uploadsDir;
    }

    /**
     * Validates + stores an uploaded file and records the media_assets row.
     * $allowed = list of mime types permitted for this endpoint.
     */
    public static function store(string $bucket, array $allowed, string $field = 'file'): array
    {
        $bin = self::storeBinary($bucket, $allowed, $field);
        $id = Uuid::v4();
        Database::run(
            'INSERT INTO media_assets (id, bucket, owner_user_id, file_path, original_name, mime_type, size_bytes, width, height, checksum, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $bucket, Auth::$user['id'], $bin['relative'], $bin['original_name'], $bin['mime'],
             $bin['size'], $bin['width'], $bin['height'], $bin['checksum'], Auth::$user['id']]
        );
        return self::row($id);
    }

    /** Validates the upload and writes it to disk; returns descriptor without a DB row. */
    private static function storeBinary(string $bucket, array $allowed, string $field, ?string $tmpOverride = null): array
    {
        $f = $_FILES[$field] ?? null;
        if ($tmpOverride === null && (!$f || !is_array($f))) {
            throw new ApiError(400, 'Choose a file to upload');
        }
        if ($tmpOverride === null) {
            $err = (int) $f['error'];
            if ($err !== UPLOAD_ERR_OK) {
                throw new ApiError(400, match ($err) {
                    UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'The uploaded file is too large',
                    UPLOAD_ERR_NO_FILE => 'Choose a file to upload',
                    default => 'The upload failed',
                });
            }
        }
        $size = $tmpOverride !== null ? (int) (filesize($tmpOverride) ?: 0) : (int) $f['size'];
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw new ApiError(400, 'Please choose a file smaller than 10 MB');
        }
        $tmp = $tmpOverride ?? (string) $f['tmp_name'];
        if ($tmpOverride === null && !is_uploaded_file($tmp)) {
            throw new ApiError(400, 'The upload failed');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) ($finfo->file($tmp) ?: 'application/octet-stream');
        if (!in_array($mime, $allowed, true)) {
            throw new ApiError(400, 'This file type is not allowed here (' . $mime . ')');
        }

        $width = null; $height = null;
        if (str_starts_with($mime, 'image/')) {
            $info = @getimagesize($tmp);
            if (!$info) {
                throw new ApiError(400, 'The image file is damaged');
            }
            [$width, $height] = [(int) $info[0], (int) $info[1]];
            if ($width < 32 || $height < 32 || $width > 10000 || $height > 10000) {
                throw new ApiError(400, 'Image dimensions must be between 32px and 10000px');
            }
        }

        $ext = self::MIME_TO_EXT[$mime] ?? 'bin';
        $relative = $bucket . '/' . date('Ym') . '/' . substr(bin2hex(random_bytes(12)), 0, 24) . '.' . $ext;
        $absolute = self::absolute($relative);
        if (!is_dir(dirname($absolute))) {
            @mkdir(dirname($absolute), 0775, true);
        }
        if ($tmpOverride !== null) {
            $ok = @rename($tmp, $absolute);
        } else {
            $ok = @move_uploaded_file($tmp, $absolute);
        }
        if (!$ok && file_exists($tmp)) {
            $ok = @copy($tmp, $absolute);
        }
        if (!$ok || !is_file($absolute)) {
            throw new ApiError(500, 'Could not store the file');
        }
        @chmod($absolute, 0664);

        $original = null;
        if ($fIdx = $tmpOverride ? null : ($f['name'] ?? null)) {
            $original = is_string($fIdx) ? mb_substr(basename($fIdx), 0, 255) : null;
        }
        return [
            'relative' => $relative, 'original_name' => $original, 'mime' => $mime, 'size' => $size,
            'width' => $width, 'height' => $height, 'checksum' => hash_file('sha256', $absolute) ?: null,
        ];
    }

    public static function row(string $id): ?array
    {
        return Database::row('SELECT * FROM media_assets WHERE id = ?', [$id]);
    }

    private static function rowOrFail(string $id): array
    {
        $m = self::row($id);
        if (!$m) {
            throw new ApiError(404, 'Media not found');
        }
        return $m;
    }

    /** Serves the file with permission checks + cache headers (no direct path exposure). */
    public static function serve(string $id): never
    {
        $m = self::rowOrFail($id);
        $bucket = (string) $m['bucket'];
        if (!in_array($bucket, ['media', 'social'], true)) {
            Auth::requireLogin();
            if ($bucket === 'receipts'
                && !Auth::$isAdmin
                && ($m['owner_user_id'] ?? null) !== (Auth::$user['id'] ?? null)) {
                throw new ApiError(403, 'You cannot open this receipt');
            }
        }
        // buckets 'media' and 'social' are published website graphics — publicly readable.

        $absolute = self::absolute((string) $m['file_path']);
        if (!is_file($absolute)) {
            throw new ApiError(404, 'File is missing from storage');
        }
        $etag = 'W/"' . substr((string) ($m['checksum'] ?: md5((string) $m['updated_at'])), 0, 24) . '"';
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            header('ETag: ' . $etag);
            exit;
        }
        $public = in_array($bucket, ['media', 'social'], true);
        header('Content-Type: ' . (string) $m['mime_type']);
        header('X-Content-Type-Options: nosniff');
        header('ETag: ' . $etag);
        header('Cache-Control: ' . ($public ? 'public, max-age=3600, stale-while-revalidate=86400' : 'private, max-age=300'));
        header('Content-Length: ' . (string) filesize($absolute));
        $chunkSize = 64 * 1024;
        $handle = fopen($absolute, 'rb');
        if ($handle) {
            while (!feof($handle)) {
                echo fread($handle, $chunkSize);
                flush();
            }
            fclose($handle);
        }
        exit;
    }

    public static function absolute(string $relative): string
    {
        return self::$uploadsDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    }

    /** Updates metadata (alt text / caption). Admin or owner. */
    public static function updateMeta(string $id, array $body): array
    {
        $m = self::rowOrFail($id);
        if (!Auth::$isAdmin && (($m['owner_user_id'] ?? null) !== (Auth::$user['id'] ?? null))) {
            throw new ApiError(403, 'Only the uploader or an administrator can edit this file');
        }
        $alt = Req::text($body, 'alt_text', 255);
        $cap = Req::text($body, 'caption', 255);
        $sets = []; $params = [];
        if ($alt !== null) { $sets[] = 'alt_text = ?'; $params[] = $alt; }
        if ($cap !== null) { $sets[] = 'caption = ?'; $params[] = $cap; }
        if ($sets) {
            $params[] = $id;
            Database::run('UPDATE media_assets SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        }
        return self::row($id) ?? [];
    }

    /** Replaces the binary, keeping the asset id stable so page references keep working. */
    public static function replace(string $id, array $allowed): array
    {
        $m = self::rowOrFail($id);
        if (!Auth::$isAdmin && (($m['owner_user_id'] ?? null) !== (Auth::$user['id'] ?? null))) {
            throw new ApiError(403, 'Only the uploader or an administrator can replace this file');
        }
        if (($_FILES['file']['size'] ?? 0) <= 0) {
            throw new ApiError(400, 'Choose a file to upload');
        }
        $storage = self::storeBinary((string) $m['bucket'], $allowed, 'file');
        $newPath = self::absolute($storage['relative']);
        $oldPath = self::absolute((string) $m['file_path']);
        try {
            Database::run(
                'UPDATE media_assets SET file_path = ?, original_name = ?, mime_type = ?, size_bytes = ?, width = ?, height = ?, checksum = ?
                  WHERE id = ?',
                [$storage['relative'], $storage['original_name'], $storage['mime'], $storage['size'],
                 $storage['width'], $storage['height'], $storage['checksum'], $id]
            );
        } catch (Throwable $e) {
            @unlink($newPath);
            throw $e;
        }
        if (is_file($oldPath) && $oldPath !== $newPath) {
            @unlink($oldPath);
        }
        Audit::log('replace_media', 'media', $id, ['bucket' => $m['bucket'], 'original_name' => $storage['original_name']]);
        return self::row($id) ?? [];
    }

    public static function delete(string $id): void
    {
        $m = self::rowOrFail($id);
        if (!Auth::$isAdmin && (($m['owner_user_id'] ?? null) !== (Auth::$user['id'] ?? null))) {
            throw new ApiError(403, 'Only the uploader or an administrator can delete this file');
        }
        Database::run('DELETE FROM media_assets WHERE id = ?', [$id]);
        $path = self::absolute((string) $m['file_path']);
        if (is_file($path)) {
            @unlink($path);
        }
        Audit::log('delete_media', 'media', $id, ['bucket' => $m['bucket'], 'original_name' => $m['original_name']]);
    }

    /** Admin library listing with pagination + filters. */
    public static function listAll(): array
    {
        $bucket = trim((string) ($_GET['bucket'] ?? ''));
        $search = trim((string) ($_GET['q'] ?? ''));
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(100, max(10, (int) ($_GET['per_page'] ?? 50)));
        $where = []; $params = [];
        if ($bucket !== '' && in_array($bucket, ['media', 'receipts', 'photos', 'social'], true)) {
            $where[] = 'bucket = ?'; $params[] = $bucket;
        }
        if ($search !== '') {
            $where[] = '(original_name LIKE ? OR alt_text LIKE ? OR caption LIKE ?)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%';
            array_push($params, $like, $like, $like);
        }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $total = (int) (Database::row('SELECT COUNT(*) AS n FROM media_assets' . $whereSql, $params)['n'] ?? 0);
        $offset = ($page - 1) * $perPage;
        $rows = Database::all(
            'SELECT id, bucket, owner_user_id, file_path, original_name, mime_type, size_bytes, width, height,
                    alt_text, caption, created_by, created_at, updated_at
               FROM media_assets' . $whereSql . ' ORDER BY created_at DESC LIMIT ' . $perPage . ' OFFSET ' . $offset,
            $params
        );
        return ['items' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }
}
