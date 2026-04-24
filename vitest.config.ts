import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
      ],
      exclude: [
        "src/lib/database.types.ts",
        "src/lib/supabase-browser.ts",
        "src/lib/supabase-server.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
