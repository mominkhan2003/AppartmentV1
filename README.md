# FlatMate Hub

FlatMate Hub is a React/TanStack application with a PHP/MySQL API. Node.js is used to develop and build the frontend; the production server on Namecheap shared hosting is Apache/PHP, so no Node process is required there.

## Development

Requirements: Node.js 22 and PHP 8.1+ with PDO MySQL, `mbstring`, and `fileinfo`.

```sh
npm ci
npm run dev
```

Start the PHP API in a second terminal:

```sh
php -S 127.0.0.1:8010 backend/api/index.php
```

## Namecheap shared hosting

The production build creates a static `index.html`, Apache rewrite rules for client-side routes, and a `namecheap-deploy/` directory containing the frontend and PHP API. Build it locally with:

```sh
npm ci
npm run deploy:namecheap
```

Upload the **contents** of `namecheap-deploy/` to the domain's document root (usually `public_html`). The generated package contains no database credentials.

### Initial setup

1. In cPanel, create a MySQL database and user, assign the user all required privileges, and import `database/schema.sql` through phpMyAdmin.
2. Copy `backend/config/database.example.php` to a private `database.php`, fill in the cPanel database values, and keep that file outside `public_html` (for example, `/home/CPANEL_USER/flatmate-config/database.php`).
3. In GitHub, add the repository variable `NAMECHEAP_APP_CONFIG_DIR` with the absolute directory containing that file. The deploy build puts this path into `.htaccess` for PHP. If you are uploading manually, add `SetEnv APP_CONFIG_DIR "/home/CPANEL_USER/flatmate-config"` to the deployed `.htaccess`.
4. In cPanel Terminal, create the first admin account (use the real email and a strong password):

   ```sh
   cd ~/public_html
   APP_CONFIG_DIR=/home/CPANEL_USER/flatmate-config php bin/create-admin.php admin@example.com 'USE-A-STRONG-PASSWORD'
   ```

5. Ensure `uploads/` is writable by PHP. For sensitive production uploads, set `uploads_dir` in the private database config to a directory outside `public_html`.

The package routes `/api/*` requests to the PHP front controller and all other unknown paths to `index.html`. It denies direct web access to backend source, configuration, database, and upload directories. Keep the generated root `.htaccess` in place.

### GitHub auto-deploy

The workflow in `.github/workflows/deploy-namecheap.yml` deploys on pushes to `main` or `master` and can also be run manually from the Actions tab. Add these repository **secrets**:

- `NAMECHEAP_FTP_SERVER` — the FTP hostname from cPanel
- `NAMECHEAP_FTP_USERNAME` — the cPanel FTP account
- `NAMECHEAP_FTP_PASSWORD` — its password
- `NAMECHEAP_FTP_SERVER_DIR` — the domain's document-root directory, usually `/public_html/`

Add the `NAMECHEAP_APP_CONFIG_DIR` repository variable as described above. Never put database or FTP credentials in source files or GitHub variables. GitHub Actions builds the app and uploads the package; edits made through the existing admin/CMS portal are saved directly to MySQL and do not require a code deployment. Database schema changes still need to be applied separately.

The workflow deploys application files only; it does not run database migrations.
