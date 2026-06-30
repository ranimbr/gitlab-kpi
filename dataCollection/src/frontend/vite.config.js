import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: ['specked-nintendo-italicize.ngrok-free.dev', '.ngrok-free.dev'],
      hmr: {
        clientPort: 5173,
        protocol: 'wss',
      },
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: ['specked-nintendo-italicize.ngrok-free.dev', '.ngrok-free.dev'],
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        }
      }
    }
  }
})