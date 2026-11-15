// Local stand-in for Vercel's function routing, so real Google sign-in can be tried with `npm run dev`.
// Run: cp .env.example .env (fill it in), then `npm run api` in one terminal and `npm run dev` in another.
// Vite proxies /api to this server (see vite.config.ts). Not used in production.
import http from 'node:http'
import * as h from './api/_lib/core.js'

const routes = {
  '/api/health': h.health,
  '/api/yt': h.yt,
  '/api/auth/login': h.login,
  '/api/auth/callback': h.callback,
  '/api/auth/token': h.token,
  '/api/auth/logout': h.logout,
  '/api/drive/init': h.driveInit,
}
const port = Number(process.env.PORT || 8787)

http
  .createServer((req, res) => {
    const fn = routes[new URL(req.url ?? '/', 'http://localhost').pathname]
    if (!fn) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end('{"error":"not_found"}')
    }
    fn(req, res)
  })
  .listen(port, () => console.log(`slate api (local) on :${port}, app origin ${process.env.APP_ORIGIN || 'http://localhost:5173'}`))
