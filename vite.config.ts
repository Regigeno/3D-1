import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works from a GitHub Pages project subpath.
  base: "./",
});
