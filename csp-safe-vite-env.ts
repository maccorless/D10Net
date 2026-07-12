import type { Plugin } from "vite";

const viteEnvPath = "/@vite/env";

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function cspSafeViteEnv(): Plugin {
  return {
    name: "csp-safe-vite-env",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(viteEnvPath)) {
          next();
          return;
        }

        const defines = server.config.define ?? {};
        response.statusCode = 200;
        response.setHeader("content-type", "application/javascript");
        response.end(`const context = globalThis;
const defines = ${escapeScriptJson(defines)};
Object.keys(defines).forEach((key) => {
  const segments = key.split(".");
  let target = context;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (i === segments.length - 1) target[segment] = defines[key];
    else target = target[segment] || (target[segment] = {});
  }
});
`);
      });
    },
  };
}
