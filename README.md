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

The production build creates a static `index.html`, Apache rewrite rules for client-side routes, and the PHP API. Generate both the upload directory and `Dist.zip` with:

```sh
npm ci
npm run package:namecheap
```

Upload `Dist.zip` to the domain's document root (usually `public_html`) and extract it there. Alternatively, upload the **contents** of `namecheap-deploy/`. The build checks both outputs and refuses to package `database.php` or `.env` files. Generated ZIPs and deployment output are Git-ignored.

### Initial setup

1. In cPanel, create a MySQL database and user, assign the user all required privileges, and import `database/schema.sql` (included in the upload package) through phpMyAdmin.
2. Create a private directory outside `public_html` and copy the safe example config there:

   ```sh
   mkdir -p ~/flatmate-config
   cp ~/public_html/config/database.example.php ~/flatmate-config/database.php
   chmod 600 ~/flatmate-config/database.php
   ```

   Edit `~/flatmate-config/database.php` with the cPanel database values. The API automatically checks this standard cPanel location. If your private directory has another path, set `APP_CONFIG_DIR` to that directory.

3. Check PHP config discovery, MySQL connection, and required schema tables in cPanel Terminal:

   ```sh
   cd ~/public_html
   php bin/diagnose.php
   ```

   The diagnostic never prints the password. If you use a custom config path, set `APP_CONFIG_DIR` to its directory for the command and in the web server environment (for example, `SetEnv APP_CONFIG_DIR "/home/CPANEL_USER/your-private-config"` in `.htaccess`). If PHP-FPM does not pass `SetEnv` through, use `~/flatmate-config` or configure the variable in cPanel's PHP-FPM environment.

4. In cPanel Terminal, create the first admin account (use the real email and a strong password):

   ```sh
   php bin/create-admin.php admin@example.com 'USE-A-STRONG-PASSWORD'
   ```

5. Ensure `uploads/` is writable by PHP. For sensitive production uploads, set `uploads_dir` in the private database config to a directory outside `public_html`.

The package routes `/api/*` requests to the PHP front controller and all other unknown paths to `index.html`. It denies direct web access to backend source, configuration, database, and upload directories. Keep the generated root `.htaccess` in place.

### GitHub auto-deploy

The workflow in `.github/workflows/deploy-namecheap.yml` builds and deploys on pushes to `main` or `master` and can also be run manually from the Actions tab. Add these repository **secrets**:

- `NAMECHEAP_FTP_SERVER` — the FTP hostname from cPanel
- `NAMECHEAP_FTP_USERNAME` — the cPanel FTP account
- `NAMECHEAP_FTP_PASSWORD` — its password
- `NAMECHEAP_FTP_SERVER_DIR` — the domain's document-root directory, usually `/public_html/`

Add the `NAMECHEAP_APP_CONFIG_DIR` repository variable as described above. Never put database or FTP credentials in source files or GitHub variables. GitHub Actions builds the app and uploads the package; edits made through the existing admin/CMS portal are saved directly to MySQL and do not require a code deployment. Database schema changes still need to be applied separately.

The workflow deploys application files only; it does not run database migrations.
