const { execSync } = require("child_process");
const path = require("path");

// Called by electron-builder after packing the app.
// Copies the assembled next-app-dist into the app's Resources folder,
// bypassing electron-builder's node_modules filtering.
exports.default = async function afterPack(context) {
  const source = path.join(__dirname, "..", "next-app-dist");
  const dest = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
    "next-app",
  );

  console.log(`Copying Next.js app to: ${dest}`);
  execSync(`cp -RL "${source}" "${dest}"`, { stdio: "inherit" });
  // Remove .DS_Store files and .git directories that break codesign
  execSync(`find "${dest}" -name '.DS_Store' -delete`, { stdio: "inherit" });
  execSync(`find "${dest}" -name '.git' -type d -exec rm -rf {} +`, { stdio: "inherit" });
  console.log("Done copying Next.js app.");
};
