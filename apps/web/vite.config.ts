import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser always calls same-origin /api/v1/*. In dev, Vite forwards it (REST + WebSocket)
// to the mock backend; point CME_API at the real Worker later and nothing else changes.
const target = process.env.CME_API ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  // three.js lives in the lazily loaded SceneCanvas chunk (~960 kB, 263 kB gzipped); no other page loads it
  build: { chunkSizeWarningLimit: 1100 },
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true, ws: true },
    },
  },
});
