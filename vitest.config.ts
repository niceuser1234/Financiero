import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // DB-Tests teilen sich eine Postgres-Instanz — seriell ausführen, damit
    // die Cleanup-Hooks jeder Suite deterministisch greifen.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});
