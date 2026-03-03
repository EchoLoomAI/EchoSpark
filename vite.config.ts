import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  let httpsConfig = undefined;

  // Prioritize local certs if they exist
  const localKeyPath = path.resolve('certs/key.pem');
  const localCertPath = path.resolve('certs/cert.pem');

  if (fs.existsSync(localKeyPath) && fs.existsSync(localCertPath)) {
    try {
      httpsConfig = {
        key: fs.readFileSync(localKeyPath),
        cert: fs.readFileSync(localCertPath),
      };
      console.log(`SSL enabled with local certs: ${localCertPath}`);
    } catch (e) {
      console.error('Failed to load local SSL certificates:', e);
    }
  } else if (env.SSL_KEY_FILE && env.SSL_CERT_FILE) {
    try {
      httpsConfig = {
        key: fs.readFileSync(env.SSL_KEY_FILE),
        cert: fs.readFileSync(env.SSL_CERT_FILE),
      };
      console.log(`SSL enabled with env certs: ${env.SSL_CERT_FILE}`);
    } catch (e) {
      console.error('Failed to load SSL certificates from env:', e);
    }
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      https: httpsConfig,
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
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'swr'],
            'vendor-ui': ['lucide-react', 'sonner', 'clsx', 'tailwind-merge'],
            'vendor-agora': ['agora-rtc-sdk-ng', 'agora-rtm'],
            'vendor-utils': ['axios', 'lodash', 'zod', 'js-cookie'],
            'vendor-genai': ['@google/genai'],
            'vendor-denoiser': ['agora-conversational-ai-denoiser'],
          }
        }
      }
    }
  };
});
