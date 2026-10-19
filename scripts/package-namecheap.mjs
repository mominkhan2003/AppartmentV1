import { access, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = path.join(projectRoot, "namecheap-deploy");
const archivePath = path.join(projectRoot, "Dist.zip");

async function assertNoPrivateFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertNoPrivateFiles(entryPath);
    } else if (entry.name === "database.php" || /^\.env(?:\.|$)/i.test(entry.name)) {
      throw new Error(`Refusing to archive private configuration file: ${entryPath}`);
    }
  }
}

try {
  await access(path.join(deployDir, "index.html"));
  await access(path.join(deployDir, "config", "database.example.php"));
  await access(path.join(deployDir, "database", "schema.sql"));
  await access(path.join(deployDir, "api", "index.php"));
  await access(path.join(deployDir, ".htaccess"));
} catch (error) {
  throw new Error("Build the Namecheap package first with npm run deploy:namecheap.", {
    cause: error,
  });
}
await assertNoPrivateFiles(deployDir);

await rm(archivePath, { force: true });

let result;
if (process.platform === "win32") {
  const quotePowerShell = (value) => `'${value.replaceAll("'", "''")}'`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `Compress-Archive -Path ${quotePowerShell(path.join(deployDir, "*"))} -DestinationPath ${quotePowerShell(archivePath)} -Force`,
  ].join("; ");
  result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: projectRoot,
    stdio: "inherit",
  });
} else {
  result = spawnSync("zip", ["-qr", archivePath, "."], {
    cwd: deployDir,
    stdio: "inherit",
  });
}

if (result.error) {
  throw new Error(`Could not create Dist.zip: ${result.error.message}`, {
    cause: result.error,
  });
}
if (result.status !== 0) {
  throw new Error(`ZIP command failed with exit code ${result.status}.`);
}

console.log(`Namecheap upload archive created at ${archivePath}`);
