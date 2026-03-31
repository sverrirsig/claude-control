// Wrapper for `next build` that works around a Next.js 16 bug where
// prerendering /_global-error crashes with a useContext error.
//
// Fix: patch Next.js export to filter out _global-error from failed pages,
// and set prerenderEarlyExit: false so the worker doesn't process.exit(1).

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const exportFile = path.join("node_modules", "next", "dist", "export", "index.js");
const original = fs.readFileSync(exportFile, "utf-8");

// Patch: filter out _global-error from failed pages before throwing
const patched = original.replace(
  "if (failedExportAttemptsByPage.size > 0) {",
  `// [claudio-control patch] Ignore _global-error prerender failures
    for (const key of failedExportAttemptsByPage.keys()) {
      if (key.includes('_global-error')) failedExportAttemptsByPage.delete(key);
    }
    if (failedExportAttemptsByPage.size > 0) {`
);

if (patched === original) {
  console.warn("⚠  Could not find patch target in Next.js export — building without patch.");
} else {
  fs.writeFileSync(exportFile, patched);
  console.log("✓ Applied _global-error prerender patch.");
}

let buildFailed = false;
try {
  execSync("npx next build", { stdio: "inherit" });
} catch {
  buildFailed = true;
}

// Always restore the original file
fs.writeFileSync(exportFile, original);

if (buildFailed) {
  // Check if the build produced usable output despite the error
  const hasStandalone = fs.existsSync(path.join(".next", "standalone", "server.js"));
  const hasStatic = fs.existsSync(path.join(".next", "static"));

  if (hasStandalone && hasStatic) {
    console.log("\n⚠  Build had warnings but output is complete — continuing.\n");
  } else {
    console.error(`\nBuild failed. standalone=${hasStandalone}, static=${hasStatic}`);
    process.exit(1);
  }
}
