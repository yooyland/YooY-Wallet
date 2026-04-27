import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** WordPress 하위 경로: https://yooyland.com/web/ */
export default defineConfig({
  plugins: [react()],
  base: '/web/',
  resolve: {
    alias: { '@web': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'] },
      },
    },
  },
});
