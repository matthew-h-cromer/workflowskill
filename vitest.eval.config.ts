import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["evals/tests/**/*.eval.ts"],
    environment: "node",
    testTimeout: 120_000,
    // Evals run sequentially to avoid hammering the API
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
