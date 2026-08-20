import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // First test in a worker pays the full server-module transform/import
    // cost; on a cold cache under parallel-file contention that alone can
    // exceed the 5s default even though the tests themselves are instant.
    testTimeout: 20_000,
    env: {
      VERCEL: "1",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules/**", "dist/**", "client/**", "attached_assets/**"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
