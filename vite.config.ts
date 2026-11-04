import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";

const { handleApiRequest } = createRequire(import.meta.url)("./api.mjs");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "practice-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if ((req.url || "").startsWith("/api/")) {
            handleApiRequest(req, res).catch((error: unknown) => {
              console.error("[api]", error);
              if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
              }
              res.end(JSON.stringify({ error: "API error" }));
            });
            return;
          }
          next();
        });
      },
    },
  ],
  build: {
    target: "es2022",
    cssCodeSplit: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/fuse.js")) return "search";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react";
          }
        },
      },
    },
  },
});
