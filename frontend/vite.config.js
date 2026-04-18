import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      "/register": {
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
