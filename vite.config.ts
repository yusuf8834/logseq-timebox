import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
  return {
    base: "./",
    plugins: [tailwindcss({}), react()],
    build: {
      target: "esnext",
      minify: "esbuild" as const,
    },
  };
});



