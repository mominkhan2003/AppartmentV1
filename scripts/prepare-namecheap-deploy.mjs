import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, ".output", "public");
const deployDir = path.join(projectRoot, "namecheap-deploy");
const indexPath = path.join(publicDir, "index.html");

try {
  await readFile(indexPath);
} catch (error) {
  throw new Error("Production build did not create .output/public/index.html", {
    cause: error,
  });
}

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployDir, { recursive: true });
await cp(publicDir, deployDir, { recursive: true });
await cp(path.join(projectRoot, "backend", "api"), path.join(deployDir, "api"), {
  recursive: true,
});
await cp(
  path.join(projectRoot, "backend", "config", "locate.php"),
  path.join(deployDir, "config", "locate.php"),
);
await cp(path.join(projectRoot, "backend", "src"), path.join(deployDir, "src"), {
  recursive: true,
});

const configDir = path.join(deployDir, "config");
await mkdir(configDir, { recursive: true });
await cp(
  path.join(projectRoot, "backend", "config", "bootstrap.php"),
  path.join(configDir, "bootstrap.php"),
);
await cp(
  path.join(projectRoot, "backend", "config", "database.example.php"),
  path.join(configDir, "database.example.php"),
);
await cp(
  path.join(projectRoot, "backend", "bin", "create-admin.php"),
  path.join(deployDir, "bin", "create-admin.php"),
);
await cp(
  path.join(projectRoot, "backend", "bin", "diagnose.php"),
  path.join(deployDir, "bin", "diagnose.php"),
);
await cp(
  path.join(projectRoot, "database", "schema.sql"),
  path.join(deployDir, "database", "schema.sql"),
);

const uploadsDir = path.join(deployDir, "uploads");
await mkdir(uploadsDir, { recursive: true });
await writeFile(path.join(uploadsDir, ".htaccess"), "Require all denied\n", "utf8");

let htaccess = await readFile(path.join(projectRoot, "deployment", "namecheap.htaccess"), "utf8");
const appConfigDir = process.env.NAMECHEAP_APP_CONFIG_DIR?.trim();
if (appConfigDir) {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(appConfigDir)) {
    throw new Error(
      "NAMECHEAP_APP_CONFIG_DIR must be an absolute Linux path without spaces or quotes.",
    );
  }
  htaccess = `SetEnv APP_CONFIG_DIR "${appConfigDir}"\n\n${htaccess}`;
}
await writeFile(path.join(deployDir, ".htaccess"), htaccess, "utf8");

async function assertNoPrivateFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertNoPrivateFiles(entryPath);
      continue;
    }
    if (entry.name === "database.php" || /^\.env(?:\.|$)/i.test(entry.name)) {
      throw new Error(`Refusing to package private configuration file: ${entryPath}`);
    }
  }
}

for (const relativePath of [
  "index.html",
  ".htaccess",
  "api/index.php",
  "config/bootstrap.php",
  "config/locate.php",
  "config/database.example.php",
  "bin/diagnose.php",
  "database/schema.sql",
]) {
  try {
    await readFile(path.join(deployDir, relativePath));
  } catch (error) {
    throw new Error(`Namecheap package is missing required file: ${relativePath}`, {
      cause: error,
    });
  }
}
await assertNoPrivateFiles(deployDir);

console.log(`Namecheap deployment package prepared at ${deployDir}`);
