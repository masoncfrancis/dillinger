const { spawnSync } = require("node:child_process");
const path = require("node:path");

const npmCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nextBuild = spawnSync(npmCommand, ["next", "build"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, NEXT_DESKTOP_BUILD: "1" },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (nextBuild.error) {
  throw nextBuild.error;
}

if (nextBuild.status !== 0) {
  process.exit(nextBuild.status ?? 1);
}

const prepare = spawnSync(process.execPath, [
  path.join(__dirname, "prepare-electron-server.cjs"),
], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
});

if (prepare.error) {
  throw prepare.error;
}

process.exit(prepare.status ?? 1);
