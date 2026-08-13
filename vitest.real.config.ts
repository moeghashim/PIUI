import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/real-pi.test.ts"],
  },
});
