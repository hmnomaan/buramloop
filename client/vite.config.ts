import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@zxing') || id.includes('tesseract.js')) {
            return 'scanner';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('react-dom') || id.includes('react')) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
