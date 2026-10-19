import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

console.log(`Namecheap deployment package prepared at ${deployDir}`);
