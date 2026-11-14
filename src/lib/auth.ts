import { AuthError, type Profile } from './types'

// The refresh token never reaches JavaScript: it lives in an encrypted httpOnly cookie set by the
// auth server. The browser only ever holds a one-hour access token, in memory.
let token: { value: string; exp: number } | null = null
let inflight: Promise<Profile | null> | null = null

const post = (path: string) => fetch(path, { method: 'POST', headers: { 'X-Slate': '1' }, credentials: 'same-origin' })

export function fetchSession(): Promise<Profile | null> {
  inflight ??= (async () => {
    try {
      const res = await post('/api/auth/token')
      if (!res.ok) return null
      const j = (await res.json()) as { access_token: string; expires_in: number; profile: Profile }
      token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }
      return j.profile
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export async function getToken(): Promise<string> {
  if (token && token.exp - Date.now() > 60_000) return token.value
  const profile = await fetchSession()
  if (!profile || !token) throw new AuthError()
  return token.value
}

/** Free hosts sleep. Poll the health endpoint until the server answers (or we give up). */
export async function waitForServer(maxMs = 75_000, onWait?: () => void): Promise<boolean> {
  const started = Date.now()
  let told = false
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(8000) })
      if (res.ok && (await res.text()).trim() === 'ok') return true
      if (res.status === 404) return false // no auth server behind /api at all
    } catch {
      /* still waking */
    }
    if (!told) {
      told = true
      onWait?.()
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  return false
}

export const wakeServer = () => void fetch('/api/health').catch(() => {})

/** Wake the auth server if it is asleep, then hand over to Google. Returns false if it never answers. */
export async function signIn(onStatus: (message: string) => void): Promise<boolean> {
  const up = await waitForServer(75_000, () => onStatus('Waking the sign-in server. Free hosting sleeps when idle, so this can take up to a minute.'))
  if (!up) return false
  localStorage.removeItem('slate-mode') // leave demo mode behind
  location.assign('/api/auth/login')
  return true
}

export async function logout() {
  token = null
  try {
    await post('/api/auth/logout')
  } catch {
    /* cookie is cleared server-side on next successful call */
  }
}
