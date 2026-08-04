import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: {
    port: 5173,
    // In development the client runs on its own port, so the socket handshake is
    // proxied to the API rather than hard-coding an endpoint into the bundle.
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true },
      '/healthz': { target: 'http://127.0.0.1:5000' },
    },
  },
})
