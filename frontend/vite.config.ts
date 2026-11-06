import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "/QA-Hub/",
  server: { host: "localhost", port: 8765, strictPort: true },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist", sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        auth: fileURLToPath(new URL("./auth.html", import.meta.url))
      }
    }
  },
  test: { environment: "node" }
});
