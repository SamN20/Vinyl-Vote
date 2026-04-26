import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function publicSiteUrlPlugin() {
  const publicSiteUrl = (process.env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  return {
    name: "public-site-url-html",
    transformIndexHtml(html) {
      return html.replaceAll("__PUBLIC_SITE_URL__", publicSiteUrl);
    },
  };
}

export default defineConfig({
  plugins: [react(), publicSiteUrlPlugin()],
  base: process.env.VITE_BASE || "/",
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    setupFiles: "./src/test/setupTests.js",
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/oauth": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/login": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/logout": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/register": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/legacy": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/dev": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/static": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
