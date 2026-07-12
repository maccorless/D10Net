import { defineConfig } from "vite";
import { cspSafeViteEnv } from "../../csp-safe-vite-env";

export default defineConfig({
  plugins: [cspSafeViteEnv()],
  base: "/publisher/",
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:8787",
    },
  },
});
