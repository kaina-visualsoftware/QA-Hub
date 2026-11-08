import { defineConfig } from "vitest/config";
import { env as nodeEnv } from "node:process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Main build retains the historical base for CI; the release workflow
  // builds the React SPA under /QA-Hub/react/ without replacing legacy assets.
  base: nodeEnv.QA_VITE_BASE || "/QA-Hub/",
  server: { host: "localhost", port: 8765, strictPort: true },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist", sourcemap: false, manifest: true,
    rollupOptions: {
      input: {
        main: "index.html",
        auth: "auth.html"
      }
    }
  },
  test: { environment: "node" }
});
