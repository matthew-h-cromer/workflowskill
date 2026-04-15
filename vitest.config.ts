import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "evals/tests/**/*.eval.ts"],
    environment: "node",
  },
});
