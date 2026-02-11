import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001', // EchoHub BFF Service
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/v1'),
        },
        '/v1': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/v2': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/convoai': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
