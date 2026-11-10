import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (id.includes("/react-dom/") || id.includes("/react/"))
            return "react-vendor";
          if (id.includes("/react-router") || id.includes("/@remix-run/"))
            return "router-vendor";
          if (id.includes("/@tanstack/")) return "query-vendor";
          if (id.includes("/lucide-react/")) return "icons-vendor";
          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/") ||
            id.includes("/zod/")
          )
            return "forms-vendor";
        },
      },
    },
  },
});
