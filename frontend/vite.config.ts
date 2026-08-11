import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const maplibreDist = resolve(process.cwd(), "node_modules/maplibre-gl/dist");
const maplibreVersion = JSON.parse(
  readFileSync(resolve(process.cwd(), "node_modules/maplibre-gl/package.json"), "utf8"),
) as { version: string };
const maplibreAssetDirectory = `assets/maplibre-${maplibreVersion.version}`;
const maplibreFiles = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

function maplibreWorkerAssets(): Plugin {
  return {
    name: "maplibre-worker-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        const filename = maplibreFiles.find(
          (candidate) => pathname === `/${maplibreAssetDirectory}/${candidate}`,
        );
        if (!filename) return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/javascript");
        response.setHeader("Cache-Control", "no-cache");
        response.end(readFileSync(resolve(maplibreDist, filename)));
      });
    },
    generateBundle() {
      for (const filename of maplibreFiles) {
        this.emitFile({
          type: "asset",
          fileName: `${maplibreAssetDirectory}/${filename}`,
          source: readFileSync(resolve(maplibreDist, filename)),
        });
      }
    },
  };
}

export default defineConfig({
  define: {
    __MAPLIBRE_WORKER_URL__: JSON.stringify(`/${maplibreAssetDirectory}/maplibre-gl-worker.mjs`),
  },
  plugins: [react(), maplibreWorkerAssets()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
    css: true,
    globals: true,
  },
});
