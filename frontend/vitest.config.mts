import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure-logic tests only (money math, lifecycle helpers): no DOM, no Next.js runtime.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
