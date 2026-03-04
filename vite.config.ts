import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['www.echoloom.cn', 'echoloom.cn', 'spark.echoloom.cn', '1.13.142.70', 'localhost', '127.0.0.1', '.ngrok-free.app'], // 允许的域名列表
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
    plugins: [
      react(),
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        deleteOriginFile: false,
        threshold: 10240, // Compress files larger than 10KB
      }),
      // visualizer({
      //   open: false,
      //   gzipSize: true,
      //   brotliSize: true,
      //   filename: 'stats.html',
      // }),
    ],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env': {}, // Polyfill for libraries expecting process.env
      'process': { env: {} } // Polyfill for libraries expecting global process
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'swr',
        'lucide-react',
        'sonner',
        'clsx',
        'tailwind-merge',
        'agora-rtc-sdk-ng',
        'agora-rtm',
        'axios',
        'lodash',
        'zod',
        'js-cookie',
        '@google/genai',
        'agora-conversational-ai-denoiser'
      ],
      exclude: []
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'swr'],
            'vendor-ui': ['lucide-react', 'sonner', 'clsx', 'tailwind-merge'],
            'vendor-rtc': ['agora-rtc-sdk-ng'],
            'vendor-rtm': ['agora-rtm'],
            'vendor-utils': ['axios', 'lodash', 'zod', 'js-cookie'],
            'vendor-genai': ['@google/genai'],
            'vendor-denoiser': ['agora-conversational-ai-denoiser'],
          }
        }
      }
    }
  };
});
