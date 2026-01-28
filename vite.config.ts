import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Build configuration tailored for VS Code webview hosting
    build: {
      // Output directly into the VS Code extension's media folder
      outDir: 'vscode-extension/media',
      emptyOutDir: true,
      // Use stable filenames so the extension can easily reference them
      rollupOptions: {
        output: {
          entryFileNames: 'assets/main.js',
          chunkFileNames: 'assets/chunk-[name].js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    },
    // Ensure Vite generates relative asset URLs
    base: './'
  };
});
