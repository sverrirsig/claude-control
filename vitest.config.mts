import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    setupFiles: ["src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**", "**/dist/**", "**/next-app-dist/**"],
  },
});
