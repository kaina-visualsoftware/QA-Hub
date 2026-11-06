import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/QA-Hub/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node" }
});
