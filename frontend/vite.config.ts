import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// In dev, /api goes to the local runner for the sign-in functions (`npm run api`, see dev-api.mjs).
// In production the same code runs as Vercel Functions on the same domain, so the session cookie is first-party.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', cssMinify: true },
})
