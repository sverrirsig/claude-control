// Wrapper for `next build` that works around a Next.js 16 bug where
// prerendering /_global-error crashes with a useContext error.
//
// The normal `next build` generates standalone output AFTER prerendering,
// so when prerender fails, standalone is never created. We work around this
// by running compile mode first (creates standalone), then running the full
// build to generate all static assets and page data. If the full build fails
// (due to _global-error), we still have everything we need.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Step 1: Compile mode — produces standalone server output
console.log("Step 1: Building standalone server (compile mode)...\n");
execSync("npx next build --experimental-build-mode compile", {
  stdio: "inherit",
  env: { ...process.env },
});

// Save the standalone output outside .next (full build may clean .next)
const standaloneDir = path.join(".next", "standalone");
const standaloneBackup = path.join(".standalone_backup");
if (fs.existsSync(standaloneDir)) {
  execSync(`cp -RL "${standaloneDir}" "${standaloneBackup}"`, { stdio: "inherit" });
}

// Step 2: Full build — generates static assets, CSS, font manifests, page data
console.log("\nStep 2: Full build (static assets + page data)...\n");
try {
  execSync("npx next build", { stdio: "inherit", env: { ...process.env } });
} catch {
  console.log("\n⚠  Full build failed (expected: Next.js 16 _global-error prerender bug).");
}

// Restore standalone if the full build didn't produce it
if (!fs.existsSync(path.join(standaloneDir, "server.js")) && fs.existsSync(standaloneBackup)) {
  console.log("Restoring standalone output from compile step...");
  if (fs.existsSync(standaloneDir)) fs.rmSync(standaloneDir, { recursive: true });
  fs.renameSync(standaloneBackup, standaloneDir);

  // Copy static assets into standalone (normally done by next build post-export)
  const staticSrc = path.join(".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(staticDest, { recursive: true });
    execSync(`cp -RL "${staticSrc}/" "${staticDest}/"`, { stdio: "inherit" });
  }

  // Copy server chunks and manifests into standalone
  const serverSrc = path.join(".next", "server");
  const serverDest = path.join(standaloneDir, ".next", "server");
  if (fs.existsSync(serverSrc) && fs.existsSync(serverDest)) {
    execSync(`cp -RL "${serverSrc}/" "${serverDest}/"`, { stdio: "inherit" });
  }
} else if (fs.existsSync(standaloneBackup)) {
  // Clean up backup
  fs.rmSync(standaloneBackup, { recursive: true });
}

// Verify
const hasStandalone = fs.existsSync(path.join(standaloneDir, "server.js"));
const hasStatic = fs.existsSync(path.join(".next", "static"));
if (!hasStandalone || !hasStatic) {
  console.error(`Build output incomplete: standalone=${hasStandalone}, static=${hasStatic}`);
  process.exit(1);
}

console.log("\n✓ Build complete.\n");
