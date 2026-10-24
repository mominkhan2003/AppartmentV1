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

Upload `Dist.zip` to `greenbox.prosensia.pk`'s document root shown in **cPanel → Domains**, and extract it there. Do not assume this subdomain uses the account's main `public_html`. Alternatively, upload the **contents** of `namecheap-deploy/`. The build checks both outputs and refuses to package `database.php` or `.env` files. The generated deployment directory is Git-ignored; `Dist.zip` is the existing tracked upload artifact.

### Initial setup for `greenbox.prosensia.pk`

Do not type a literal `~` into cPanel File Manager or assume PHP expands it. It is shell notation. First identify the subdomain document root in **cPanel → Domains**. In cPanel Terminal, `$HOME` resolves to the account's actual home directory:

```sh
printf 'Account home: %s\n' "$HOME"
mkdir -p "$HOME/flatmate-config"
find "$HOME" -type f -path '*/config/database.example.php' -print
```

The actual hosting home and document-root paths are not available in this repository. Use the document root shown in cPanel Domains to identify the matching template path printed by `find`, then copy that template to `$HOME/flatmate-config/database.php` using File Manager or Terminal. For example, from the account home, after confirming there is only one matching deployed app:

```sh
template="$(find "$HOME" -type f -path '*/config/database.example.php' -print -quit)"
test -n "$template" || { echo 'Template not found; check the selected domain document root.' >&2; exit 1; }
cp "$template" "$HOME/flatmate-config/database.php"
chmod 600 "$HOME/flatmate-config/database.php"
```

Edit the private config with cPanel's **MySQL Databases** values. The file must return a PHP array with these exact required keys:

```php
return [
    'host' => 'YOUR_CPANEL_MYSQL_HOST',
    'database' => 'YOUR_CPANEL_DATABASE_NAME',
    'username' => 'YOUR_CPANEL_DATABASE_USER',
    'password' => 'YOUR_DATABASE_PASSWORD',
    'charset' => 'utf8mb4',
    // Optional application settings may remain from database.example.php.
];
```

Use the database host shown by Namecheap, not an assumed host. The template at `config/database.example.php` contains placeholders only; never upload the completed private config to `public_html`.

In cPanel **MySQL Databases**, create the database and user, add the user to that database, and grant **All Privileges**. Import the package's `database/schema.sql` through phpMyAdmin. This does not reset existing data; do not re-import over a production database unless you understand the SQL statements and have a backup.

The loader checks `APP_CONFIG_DIR` first (including `$_SERVER`/`$_ENV` values), then PHP's `HOME`, the cPanel account home inferred from the document root, the PHP account home, and document-root ancestors. Local config fallback is enabled only for CLI and PHP's built-in development server. It explicitly expands `~/...`; it does not rely on PHP to expand a literal tilde.

If discovery is unavailable for the subdomain's PHP-FPM process, configure the actual absolute path. The Terminal command below prints a ready-to-copy Apache directive using the hosting account's real `$HOME` (do not replace it with a guessed username):

```sh
printf 'SetEnv APP_CONFIG_DIR "%s/flatmate-config"\n' "$HOME"
```

Add that exact output to the subdomain document root's existing root `.htaccess`, above its rewrite rules. `APP_CONFIG_DIR` is the directory containing `database.php`, not the filename. It can also be set in cPanel's PHP-FPM/application environment. If the host's PHP-FPM does not expose Apache `SetEnv` to PHP, use the default home-directory discovery or set the variable in the PHP-FPM environment.

Check config discovery, PDO MySQL, connectivity, and all required tables. The script resolves the schema relative to itself, so it can be run by its full path:

```sh
php -m | grep -iE '^(PDO|pdo_mysql)$'
diagnostic="$(find "$HOME" -type f -path '*/bin/diagnose.php' -print -quit)"
test -n "$diagnostic" || { echo 'Diagnostic not found; upload and extract Dist.zip first.' >&2; exit 1; }
php "$diagnostic"
```

If multiple project copies are under the account home, select the diagnostic path whose parent is the document root shown for `greenbox.prosensia.pk` in cPanel Domains. The diagnostic prints the checked config paths if the file is missing, reports whether PDO MySQL connects, and verifies all tables from `database/schema.sql`. It never prints the database password. A successful connection and table check verifies the database exists and the account can read its tables; the cPanel All Privileges assignment is still required for the app's writes. Confirm PDO MySQL is also enabled for the PHP version assigned to this domain in cPanel; CLI and website PHP handlers can have different extension settings.

If config discovery fails, confirm the file exists at the absolute path printed by `printf '%s\n' "$HOME/flatmate-config/database.php"`, is readable by the site's PHP user, and is named exactly `database.php`. Run `php bin/diagnose.php` again. Do not copy credentials into the public document root.

Create the first administrator only after the diagnostic passes. Run this from the cPanel Terminal with the current directory set to the selected subdomain document root (use the exact path shown in cPanel Domains; it is not available from this checkout). Use the real email and a strong password:

```sh
pwd
php bin/create-admin.php admin@example.com 'USE-A-STRONG-PASSWORD'
```

Ensure `uploads/` is writable by PHP. For sensitive production uploads, set `uploads_dir` in the private database config to a directory outside the document root.

The package routes `/api/*` requests to the PHP front controller and all other unknown paths to `index.html`. It denies direct web access to backend source, configuration, database, and upload directories. Keep the generated root `.htaccess` in place.

### GitHub auto-deploy

The workflow in `.github/workflows/deploy-namecheap.yml` builds and deploys on pushes to `main` or `master` and can also be run manually from the Actions tab. Add these repository **secrets**:

- `NAMECHEAP_FTP_SERVER` — the FTP hostname from cPanel
- `NAMECHEAP_FTP_USERNAME` — the cPanel FTP account
- `NAMECHEAP_FTP_PASSWORD` — its password
- `NAMECHEAP_FTP_SERVER_DIR` — the domain's document-root directory, usually `/public_html/`

Add the `NAMECHEAP_APP_CONFIG_DIR` repository variable as described above. Never put database or FTP credentials in source files or GitHub variables. GitHub Actions builds the app and uploads the package; edits made through the existing admin/CMS portal are saved directly to MySQL and do not require a code deployment. Database schema changes still need to be applied separately.

The workflow deploys application files only; it does not run database migrations.
