import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Minificar el código en producción
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Eliminar console.log en producción
        drop_debugger: true, // Eliminar debugger en producción
      },
      mangle: true, // Ofuscar nombres de variables
      format: {
        comments: false, // Eliminar comentarios
      },
    },
    // Optimizar chunks
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    // Generar sourcemaps solo para desarrollo
    sourcemap: mode === 'development',
  },
}));
