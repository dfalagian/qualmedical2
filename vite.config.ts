import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Minificar el código en producción con esbuild (incluido en Vite)
    minify: mode === 'production' ? 'esbuild' : false,
    // Optimizar y proteger el código
    target: 'esnext',
    // Generar sourcemaps solo para desarrollo
    sourcemap: mode === 'development',
  },
  esbuild: {
    // En producción, eliminar console.log y debugger
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    // Minificar nombres en producción
    minifyIdentifiers: mode === 'production',
    minifySyntax: mode === 'production',
    minifyWhitespace: mode === 'production',
  },
}));
