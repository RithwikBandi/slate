import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// In dev, /api goes to the local sign-in service (cd backend && node --env-file=.env index.js). In production Vercel rewrites
// /api/* to the Render service, so the session cookie is always first-party.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', cssMinify: true },
})
