# Slate

**Every video, ready to publish.** Slate keeps each video's raw footage, edits, thumbnails and publish kit (title, description, pinned comment, tags) together in the creator's **own Google Drive**, and walks them through publishing.

Free to run. No database. Files upload straight from the browser to Google Drive.

## What it does

- **Videos as projects**: each video gets a Drive folder with `Raw footage`, `Edited`, `Thumbnails` and any folders you add.
- **Resumable uploads** in 8 MB chunks with pause, resume and retry. The uploaded size is checked against the local file, so you know when the laptop copy is safe to delete.
- **Publish kit** with character counters for YouTube's limits, one-click copy per field, reusable templates and JSON import.
- **Pipeline**: Idea, In edit, Ready, Scheduled, Published, as a drag-and-drop board, a grid, and a calendar.
- **Publish mode**: a checklist beside YouTube Studio (download the final, copy each field, paste the link).
- **Series and episode numbers**, publishing streak, storage meter read live from Google, share link for an editor, full JSON export.
- **Demo mode**: a pretend vault that lives only in the browser, so anyone can try it without signing in.
- A readable `Publish kit.txt` is written next to the footage, so the vault is useful without Slate.

Not included on purpose: automatic YouTube upload and a browser extension.

## How it is built

| Part | Choice |
|---|---|
| Web app | Vite, React 19, TypeScript, React Router, Tailwind CSS v4, Zustand |
| UI | Hand-built on Radix Dialog and cmdk. No templates |
| Motion | View Transitions API in the app. GSAP ScrollTrigger and Lenis on the landing page only. A small custom WebGL shader for the hero (no 3D library) |
| Storage | The user's Google Drive, scope `drive.file` (Slate can only touch files it created). One `slate.db.json` holds the text data |
| Sign-in | `server/index.js`: a zero-dependency Node service. The refresh token lives only in an AES-256-GCM encrypted, httpOnly cookie in the user's browser |
| Hosting | Web app on Vercel. Sign-in service on Render, reached through Vercel's `/api/*` rewrite so the cookie is first-party |

```
src/lib/        types, Drive adapter, demo adapter, vault store, upload queue, auth client
src/components/ shell, command palette, upload tray, file browser, cards, UI primitives
src/pages/      Landing, Home, Videos, VideoDetail, Calendar, Library, Settings, Legal
server/         sign-in service for Render
```

## Run it locally

```bash
npm install
npm run dev            # http://localhost:5173  ("Try the demo" works with no setup)
```

To use real Google sign-in locally, copy `.env.example` to `.env`, fill it in, then in a second terminal:

```bash
node --env-file=.env server/index.js
```

Add `http://localhost:5173/api/auth/callback` to the OAuth client's redirect URIs.

## Deploy (all free tiers)

### 1. Google Cloud (about 10 minutes, no billing account needed)

1. Go to <https://console.cloud.google.com>, create a project.
2. **APIs & Services > Library**: enable **Google Drive API** (and **YouTube Data API v3** if you want view counts).
3. **APIs & Services > OAuth consent screen**: user type **External**. Fill in the app name, your email, and the home page, privacy (`/privacy`) and terms (`/terms`) links of your deployed site. Add the scope `.../auth/drive.file`.
4. Still on the consent screen, press **Publish app** so the status is **In production**. In *Testing*, sign-ins expire after 7 days.
5. **Credentials > Create credentials > OAuth client ID > Web application**. Under *Authorized redirect URIs* add `https://YOUR-APP.vercel.app/api/auth/callback`. Copy the client ID and secret.
6. Optional: **Create credentials > API key**, restrict it to YouTube Data API v3. This is `YT_API_KEY`.

### 2. Render (the sign-in service)

1. Push this repository to GitHub.
2. In Render: **New > Blueprint**, pick the repository. It reads `render.yaml`.
3. Set the environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN` (`https://YOUR-APP.vercel.app`, no trailing slash) and optionally `YT_API_KEY`. `COOKIE_SECRET` is generated for you.
4. Note the service URL, for example `https://slate-auth.onrender.com`.

### 3. Vercel (the web app)

1. In `vercel.json`, change the first rewrite's destination to your Render URL.
2. Import the repository in Vercel. Framework preset: **Vite**. No environment variables are needed.
3. If you use a custom domain, update `APP_ORIGIN` on Render and the redirect URI in Google to match it.

### 4. Keep the sign-in service awake

Render's free services sleep after 15 minutes without traffic and take up to a minute to wake.

- **Primary**: create a free job at <https://cron-job.org> that requests `https://YOUR-RENDER-URL/api/health` every **10 minutes**.
- **Backup**: `.github/workflows/keepalive.yml` does the same from GitHub Actions. Add a repository variable `RENDER_URL`. GitHub's scheduler can run late, which is why it is only the backup.
- The web app also pings the service as soon as the landing page opens, and waits for it before sending anyone to Google.

One always-on free service uses about 744 of Render's 750 free hours per month, so keep this as the only free service in that Render workspace.

## Costs

Nothing here needs a paid plan or a card. Things to know:

- **Storage is the user's own Google storage.** Slate shows the real quota from Google. If an account fills up, Google stops new uploads until space is freed or the Google plan is changed.
- **Vercel's free plan is for non-commercial use.** If Slate is ever sold, move the web app to a host that allows that.
- Never store data in a free Render database (they are deleted after 30 days). Slate does not use one.

## Security notes

- Scope is `drive.file` only: Slate cannot read anything in Drive that it did not create.
- OAuth uses the authorization-code flow with PKCE and a state check. State-changing endpoints need a custom header and a matching `Origin`.
- The client secret and refresh token never reach browser JavaScript. The access token (1 hour) is held in memory only.
- `vercel.json` sets a Content-Security-Policy and standard hardening headers.

## Status

Built and tested against demo mode end to end (create, upload, kit, board, calendar, publish). The real Google Drive path is implemented but needs the credentials above before it can be exercised; the first thing to verify after deploying is a multi-chunk upload.
