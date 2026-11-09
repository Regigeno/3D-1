import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works from a GitHub Pages project subpath.
  base: "./",
  build: {
    // Rapier's WebAssembly is inlined into one chunk, which is larger than Vite's default warning.
    chunkSizeWarningLimit: 5000,
  },
});
