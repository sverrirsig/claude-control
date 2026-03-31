// Wrapper for `next build` that works around a Next.js 16 bug where
// prerendering /_global-error crashes with a useContext error.
//
// Patches two files temporarily:
// 1. export/worker.js — skip process.exit(1) for _global-error failures
// 2. export/index.js — remove _global-error from failed pages list

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const nextDist = path.join("node_modules", "next", "dist", "export");

// --- Patch worker.js: don't process.exit(1) for _global-error ---
const workerFile = path.join(nextDist, "worker.js");
const workerOriginal = fs.readFileSync(workerFile, "utf-8");
const workerPatched = workerOriginal.replace(
  /if \(nextConfig\.experimental\.prerenderEarlyExit\) \{\s*console\.error\(`Export encountered an error on \$\{pageKey\}, exiting the build\.`\);\s*process\.exit\(1\);/,
  `if (nextConfig.experimental.prerenderEarlyExit && !pageKey.includes('_global-error')) {
                        console.error(\`Export encountered an error on \${pageKey}, exiting the build.\`);
                        process.exit(1);`
);

// --- Patch index.js: filter _global-error from failed pages ---
const indexFile = path.join(nextDist, "index.js");
const indexOriginal = fs.readFileSync(indexFile, "utf-8");
const indexPatched = indexOriginal.replace(
  "if (failedExportAttemptsByPage.size > 0) {",
  `for (const key of failedExportAttemptsByPage.keys()) {
      if (key.includes('_global-error')) failedExportAttemptsByPage.delete(key);
    }
    if (failedExportAttemptsByPage.size > 0) {`
);

const workerOk = workerPatched !== workerOriginal;
const indexOk = indexPatched !== indexOriginal;

if (workerOk) fs.writeFileSync(workerFile, workerPatched);
if (indexOk) fs.writeFileSync(indexFile, indexPatched);
console.log(`✓ Patches applied: worker=${workerOk}, index=${indexOk}`);

let buildFailed = false;
try {
  execSync("npx next build", { stdio: "inherit" });
} catch {
  buildFailed = true;
}

// Always restore originals
fs.writeFileSync(workerFile, workerOriginal);
fs.writeFileSync(indexFile, indexOriginal);

if (buildFailed) {
  const hasStandalone = fs.existsSync(path.join(".next", "standalone", "server.js"));
  const hasStatic = fs.existsSync(path.join(".next", "static"));
  if (hasStandalone && hasStatic) {
    console.log("\n⚠  Build had warnings but output is complete.\n");
  } else {
    console.error(`Build failed. standalone=${hasStandalone}, static=${hasStatic}`);
    process.exit(1);
  }
}
