import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy of the renderer. connect-src holds only what this
 * build talks to: its API (VITE_PLAN_AI_API_URL, over https and wss), Firebase
 * Auth, and Sentry. script-src keeps blob: for the AudioWorklet, which is
 * loaded from a Blob URL. The dev server needs inline scripts (React refresh)
 * and its own websocket, so development adds those.
 */
function rendererCsp(env: Record<string, string>, dev: boolean): string {
  const api = originOf(env.VITE_PLAN_AI_API_URL) ?? "http://localhost:8080";
  const connect = new Set([
    "'self'",
    api,
    api.replace(/^http/, "ws"),
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    // Sentry's renderer SDK falls back to this scheme when its preload is missing.
    "sentry-ipc:",
  ]);
  const sentry = originOf(env.VITE_SENTRY_DSN);
  if (sentry) connect.add(sentry);

  const script = ["'self'", "blob:"];
  if (dev) {
    script.push("'unsafe-inline'");
    connect.add("http://localhost:*");
    connect.add("ws://localhost:*");
  }
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;

  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // Recording playback: signed Cloud Storage URLs. firebasestorage is for
    // recordings stored before the private bucket.
    "media-src 'self' blob: https://storage.googleapis.com https://firebasestorage.googleapis.com",
    `connect-src ${[...connect].join(" ")}`,
    `frame-src ${authDomain ? `https://${authDomain}` : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Puts the policy into the meta tag of index.html (see the placeholder there). */
function cspMetaPlugin(csp: string): Plugin {
  return {
    name: "renderer-csp",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace("__RENDERER_CSP__", csp),
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const productionCsp = rendererCsp(env, false);
  const htmlCsp = command === "serve" ? rendererCsp(env, true) : productionCsp;

  // Convert env keys to string literals for global replacement
  const defineEnv = Object.keys(env).reduce((acc, key) => {
    if (key.startsWith("VITE_")) {
      acc[`import.meta.env.${key}`] = JSON.stringify(env[key]);
      acc[`process.env.${key}`] = JSON.stringify(env[key]);
    }
    return acc;
  }, {} as Record<string, string>);

  // Sentry Source Maps plugin
  const sentryPlugin = sentryVitePlugin({
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: "blueberrybytes-services-fzco",
    project: "plan-ai-recorder-electron",
  });

  return {
    main: {
      plugins: [externalizeDepsPlugin(), sentryPlugin],
      // The main process sends the same policy as a header on app:// pages.
      define: { ...defineEnv, __RENDERER_CSP__: JSON.stringify(productionCsp) },
      build: {
        sourcemap: true,
        outDir: "dist-electron/main",
        lib: {
          entry: "electron/main.ts",
        },
        rollupOptions: {
          output: {
            entryFileNames: "index.js",
          },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin(), sentryPlugin],
      define: defineEnv,
      build: {
        sourcemap: true,
        outDir: "dist-electron/preload",
        lib: {
          entry: "electron/preload.ts",
        },
        rollupOptions: {
          output: {
            entryFileNames: "index.js",
          },
        },
      },
    },
    renderer: {
      root: ".",
      build: {
        sourcemap: true,
        outDir: "dist-electron/renderer",
        rollupOptions: {
          input: "index.html",
        },
      },
      // Prevent Vite dev server from setting strict COOP headers which breaks Firebase auth popups
      server: {
        headers: {
          "Cross-Origin-Opener-Policy": "unsafe-none",
          "Cross-Origin-Embedder-Policy": "unsafe-none"
        }
      },
      plugins: [cspMetaPlugin(htmlCsp), react(), sentryPlugin],
    },
  };
});
