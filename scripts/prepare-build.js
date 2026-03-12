const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const staticDir = path.join(projectRoot, ".next", "static");
const publicDir = path.join(projectRoot, "public");
const outDir = path.join(projectRoot, "next-app-dist");

// Clean output
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}

console.log("Assembling standalone Next.js app...");

// Use cp -RL to dereference symlinks and copy everything
execSync(`cp -RL "${standaloneDir}" "${outDir}"`, { stdio: "inherit" });

// Copy static assets into .next/static
const staticDest = path.join(outDir, ".next", "static");
fs.mkdirSync(staticDest, { recursive: true });
execSync(`cp -RL "${staticDir}/" "${staticDest}/"`, { stdio: "inherit" });

// Copy public assets
const publicDest = path.join(outDir, "public");
fs.mkdirSync(publicDest, { recursive: true });
execSync(`cp -RL "${publicDir}/" "${publicDest}/"`, { stdio: "inherit" });

// Copy vendor-chunks (not included in standalone output but required at runtime)
const vendorChunksDir = path.join(projectRoot, ".next", "server", "vendor-chunks");
if (fs.existsSync(vendorChunksDir)) {
  const vendorChunksDest = path.join(outDir, ".next", "server", "vendor-chunks");
  fs.mkdirSync(vendorChunksDest, { recursive: true });
  execSync(`cp -RL "${vendorChunksDir}/" "${vendorChunksDest}/"`, { stdio: "inherit" });
  console.log("Copied vendor-chunks.");
} else {
  console.warn("WARNING: vendor-chunks directory not found in build output.");
}

// Verify
const hasNext = fs.existsSync(path.join(outDir, "node_modules", "next", "package.json"));
console.log(`node_modules/next present: ${hasNext}`);
console.log("Done. Output at:", outDir);

if (!hasNext) {
  console.error("ERROR: next module missing from standalone build!");
  process.exit(1);
}
