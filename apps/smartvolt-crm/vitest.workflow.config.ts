import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [workflow()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/workflow/*.integration.ts"],
    testTimeout: 45000,
    hookTimeout: 45000,
    fileParallelism: false,
  },
});
