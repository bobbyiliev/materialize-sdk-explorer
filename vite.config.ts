import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The bundle carries the SDK sources and test cases the pages quote.
  build: { chunkSizeWarningLimit: 1000 },
  resolve: {
    // The core's WebAssembly glue imports its exception classes from
    // "#errors", the Node package's import map entry.
    alias: { "#errors": fileURLToPath(new URL("./src/core/errors.ts", import.meta.url)) },
  },
});
