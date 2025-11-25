import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, './src/domain'),
      '@application': path.resolve(__dirname, './src/application'),
      '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
      '@presentation': path.resolve(__dirname, './src/presentation'),
      '@config': path.resolve(__dirname, './config'),
      // Support for path mappings with wildcards
      '@domain/*': path.resolve(__dirname, './src/domain'),
      '@application/*': path.resolve(__dirname, './src/application'),
      '@infrastructure/*': path.resolve(__dirname, './src/infrastructure'),
      '@presentation/*': path.resolve(__dirname, './src/presentation'),
      '@config/*': path.resolve(__dirname, './config'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
