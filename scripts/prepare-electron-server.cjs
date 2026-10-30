const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Next standalone output is missing. Run next build first.");
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});

console.log("Prepared Next standalone server for Electron packaging.");
