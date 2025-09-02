import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        engine: resolve(__dirname, 'engine.html'),
        grid: resolve(__dirname, 'grid.html'),
      },
    },
  },
});


