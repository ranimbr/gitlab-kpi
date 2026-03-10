import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth':       'http://localhost:8000',
      '/projects':   'http://localhost:8000',
      '/extraction': 'http://localhost:8000',
      '/kpis':       'http://localhost:8000',
      '/analytics':  'http://localhost:8000',
    }
  }
})