// Slate sign-in, as Vercel Functions. Zero dependencies, no database.
//
// It does one job the browser cannot do safely: hold the Google client secret and the long-lived
// refresh token. The refresh token is stored only in an AES-256-GCM encrypted, httpOnly cookie in the
// user's own browser, so this code keeps no user data at all.
//
// Files in api/ become /api/... routes. The _lib folder is not routed.
import crypto from 'node:crypto'

const env = process.env
const CLIENT_ID = env.GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET ?? ''
const APP_ORIGIN = (env.APP_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')
const COOKIE_SECRET = env.COOKIE_SECRET ?? ''
const YT_API_KEY = env.YT_API_KEY ?? ''

const CONFIGURED = Boolean(CLIENT_ID && CLIENT_SECRET && COOKIE_SECRET.length >= 32)
const KEY = crypto.scryptSync(COOKIE_SECRET || 'unconfigured', 'slate-cookie-v1', 32)
const SECURE = APP_ORIGIN.startsWith('https://')
const REDIRECT = `${APP_ORIGIN}/api/auth/callback`
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file'
const SESSION = 'slate_s'
const FLOW = 'slate_flow'
const SIX_MONTHS = 60 * 60 * 24 * 180

const b64 = (buf) => Buffer.from(buf).toString('base64url')

function seal(obj) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()])
  return b64(Buffer.concat([iv, c.getAuthTag(), ct]))
}

function unseal(value) {
  try {
    const raw = Buffer.from(value, 'base64url')
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'))
  } catch {
    return null
  }
}

function cookies(req) {
  const out = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

const cookie = (name, value, maxAge) => `${name}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE ? '; Secure' : ''}`

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string'
  res.writeHead(status, {
    'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(isText ? body : JSON.stringify(body))
}

const redirect = (res, to, setCookies = []) => {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...(setCookies.length ? { 'Set-Cookie': setCookies } : {}) })
  res.end()
}

/** Vercel parses JSON bodies for us (req.body); the plain Node dev server does not, so fall back to the stream. */
function readJson(req, limit = 10_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body)
    try {
      return Promise.resolve(JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)))
    } catch {
      return Promise.reject(new Error('Invalid JSON'))
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function google(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

/** State-changing calls must come from our own pages: custom header + matching Origin. */
function sameSite(req) {
  if (req.headers['x-slate'] !== '1') return false
  const origin = req.headers.origin
  return !origin || origin === APP_ORIGIN
}

const session = (req) => {
  const raw = cookies(req)[SESSION]
  const s = raw ? unseal(raw) : null
  return s && typeof s.rt === 'string' ? s : null
}

async function accessToken(req, res) {
  const s = session(req)
  if (!s) {
    send(res, 401, { error: 'signed_out' })
    return null
  }
  const { ok, data } = await google({ grant_type: 'refresh_token', refresh_token: s.rt })
  if (!ok || !data.access_token) {
    // Revoked, expired, or the app was removed from the Google account: drop the dead session.
    send(res, 401, { error: 'session_expired' }, { 'Set-Cookie': cookie(SESSION, '', 0) })
    return null
  }
  return { token: data.access_token, expiresIn: data.expires_in ?? 3600, s }
}

/** Wraps a route: method check, configuration check, and one place for unexpected errors. */
const route = (methods, fn, { needsConfig = true } = {}) =>
  async function handler(req, res) {
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'method_not_allowed' }, { Allow: methods.join(', ') })
      if (needsConfig && !CONFIGURED) return send(res, 503, { error: 'not_configured' })
      await fn(req, res, new URL(req.url ?? '/', 'http://localhost'))
    } catch (e) {
      console.error(`${req.method} ${req.url} failed:`, e?.message)
      if (!res.headersSent) send(res, 500, { error: 'server_error' })
    }
  }

export const health = route(['GET', 'HEAD'], (req, res) => send(res, 200, req.method === 'HEAD' ? '' : 'ok'), { needsConfig: false })

export const login = route(['GET'], (_req, res) => {
  const state = b64(crypto.randomBytes(18))
  const verifier = b64(crypto.randomBytes(32))
  const challenge = b64(crypto.createHash('sha256').update(verifier).digest())
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${q}`, [cookie(FLOW, seal({ state, verifier, t: Date.now() }), 600)])
})

export const callback = route(['GET'], async (req, res, url) => {
  const fail = (why) => redirect(res, `${APP_ORIGIN}/?auth=${why}`, [cookie(FLOW, '', 0)])
  const flow = unseal(cookies(req)[FLOW] ?? '')
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error')) return fail('cancelled')
  if (!flow || !code || url.searchParams.get('state') !== flow.state || Date.now() - flow.t > 600_000) return fail('error')

  const { ok, data } = await google({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: flow.verifier })
  if (!ok || !data.refresh_token || !data.id_token) return fail('error')
  if (!String(data.scope ?? '').includes('drive.file')) return fail('scope') // user unticked Drive access

  let profile = {}
  try {
    const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'))
    profile = { name: claims.name ?? claims.email ?? 'Creator', email: claims.email ?? '', picture: claims.picture }
  } catch {
    return fail('error')
  }
  redirect(res, `${APP_ORIGIN}/app`, [cookie(SESSION, seal({ rt: data.refresh_token, ...profile }), SIX_MONTHS), cookie(FLOW, '', 0)])
})

export const token = route(['POST'], async (req, res) => {
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' })
  const a = await accessToken(req, res)
  if (!a) return
  send(res, 200, { access_token: a.token, expires_in: a.expiresIn, profile: { name: a.s.name, email: a.s.email, picture: a.s.picture } })
})

export const logout = route(['POST'], async (req, res) => {
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' })
  const s = session(req)
  if (s) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.rt)}`, { method: 'POST' }).catch(() => {})
  send(res, 200, { ok: true }, { 'Set-Cookie': cookie(SESSION, '', 0) })
})

// Fallback for browsers that cannot read the resumable-session URL: start the session here,
// the file bytes still travel browser -> Google directly.
export const driveInit = route(['POST'], async (req, res) => {
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' })
  const a = await accessToken(req, res)
  if (!a) return
  const body = await readJson(req)
  if (typeof body.name !== 'string' || !Array.isArray(body.parents)) return send(res, 400, { error: 'bad_request' })
  const g = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${a.token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      Origin: APP_ORIGIN,
      'X-Upload-Content-Type': String(body.mimeType || 'application/octet-stream'),
      'X-Upload-Content-Length': String(Number(body.size) || 0),
    },
    body: JSON.stringify({ name: body.name.slice(0, 500), parents: body.parents.slice(0, 1) }),
  })
  const location = g.headers.get('location')
  if (!g.ok || !location) return send(res, 502, { error: 'drive_refused' })
  send(res, 200, { location })
})

export const yt = route(['GET'], async (req, res, url) => {
  if (!session(req)) return send(res, 401, { error: 'signed_out' })
  if (!YT_API_KEY) return send(res, 501, { error: 'no_key' })
  const id = url.searchParams.get('id') ?? ''
  if (!/^[\w-]{11}$/.test(id)) return send(res, 400, { error: 'bad_id' })
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${id}&key=${YT_API_KEY}`)
  const item = (await r.json().catch(() => ({}))).items?.[0]
  if (!r.ok || !item) return send(res, 404, { error: 'not_found' })
  const n = (v) => (v === undefined ? null : Number(v))
  send(res, 200, { title: item.snippet?.title ?? '', views: n(item.statistics?.viewCount), likes: n(item.statistics?.likeCount), comments: n(item.statistics?.commentCount) })
})
