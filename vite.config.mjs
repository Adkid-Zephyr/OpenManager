import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'frontend/index.html'),
        manual: resolve(__dirname, 'frontend/manual.html')
      }
    }
  }
});
