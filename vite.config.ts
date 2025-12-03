import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { logseqDevPlugin } from "./vite-plugins/logseq";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
  const plugins: PluginOption[] = [tailwindcss({})];

  if (!process.env.VITEST) {
    plugins.push(logseqDevPlugin());
  }

  plugins.push(react());

  return {
    plugins,
    build: {
      target: "esnext",
      minify: "esbuild" as const,
    },
  };
});

