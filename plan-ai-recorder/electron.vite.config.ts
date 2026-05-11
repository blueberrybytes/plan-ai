import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

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
      define: defineEnv,
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
      plugins: [react(), sentryPlugin],
    },
  };
});
