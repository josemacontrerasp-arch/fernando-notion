import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy is only injected into production builds
// (the dev server needs inline scripts for hot reload).
const csp: Plugin = {
  name: "inject-csp",
  apply: "build",
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http: fnasset:",
      "media-src 'self' data: blob: https: http: fnasset:",
      "font-src 'self' data:",
      "connect-src 'self' data: blob: https: http: fnasset:",
      "frame-src https:",
      "worker-src 'self' blob:",
    ].join("; ");
    return html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), csp],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 6000,
  },
});
