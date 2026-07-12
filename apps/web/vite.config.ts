import { defineConfig } from "vite";
import { cspSafeViteEnv } from "../../csp-safe-vite-env";
import { VitePWA } from "vite-plugin-pwa";
import {
  isCookieOnlyFinishRequest,
  isPublishedBoardRequest,
} from "./src/pwa-cache";

export default defineConfig({
  server: {
    proxy: { "/v1": "http://127.0.0.1:8787", "/test": "http://127.0.0.1:8787" },
  },
  plugins: [
    cspSafeViteEnv(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: {
        name: "Daily Top Ten",
        short_name: "Top Ten",
        start_url: "/today",
        display: "standalone",
        theme_color: "#eef1f6",
        background_color: "#eef1f6",
        icons: [],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/test$/],
        // Cache only today's published board and immutable archive versions. Any endpoint
        // capable of exposing unpublished/future boards is deliberately excluded.
        runtimeCaching: [
          {
            urlPattern: isPublishedBoardRequest,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "published-boards",
              expiration: { maxEntries: 31, maxAgeSeconds: 60 * 60 * 24 * 31 },
            },
          },
          {
            urlPattern: isCookieOnlyFinishRequest,
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "finish-play-queue",
                options: { maxRetentionTime: 60 * 24 * 7 },
              },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
