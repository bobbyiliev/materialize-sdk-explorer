import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { localMaterialize } from "./local/bridge";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === "materialize"
      ? [localMaterialize(process.env.MZ_URL ?? "postgres://materialize@localhost:26875/materialize")]
      : []),
  ],
  // The bundle carries the SDK sources and test cases the pages quote.
  build: { chunkSizeWarningLimit: 1000 },
  resolve: {
    // The core's WebAssembly glue imports its exception classes from
    // "#errors", the Node package's import map entry.
    alias: { "#errors": fileURLToPath(new URL("./src/core/errors.ts", import.meta.url)) },
  },
}));
