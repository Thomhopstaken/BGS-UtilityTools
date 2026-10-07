import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Logs only for failing tests; the code logs heavily.
    silent: "passed-only",
  },
});
