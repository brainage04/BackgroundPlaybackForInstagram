const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const { version } = require(path.join(root, "manifest.json"));
const { name } = require(path.join(root, "package.json"));
const distDir = path.join(root, "dist");
const output = path.join(distDir, `${name}-${version}.zip`);

function ensureZip() {
  try {
    execFileSync("zip", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("The `zip` command is required to build the Chrome Web Store package.");
  }
}

ensureZip();
fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(output, { force: true });

execFileSync("zip", ["-r", output, "manifest.json", "icons", "src"], {
  cwd: root,
  stdio: "inherit"
});

console.log(`Built ${path.relative(root, output)}`);
