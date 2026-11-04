import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { assetsInlineLimit: 0 },
  test: { include: ["tests/**/*.test.js"] },
});
