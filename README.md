# Slate

**Ideas in. Videos out.** A free workspace for creators that keeps every video's script, footage, edits and publish kit in the creator's **own Google Drive**, and walks each one from idea to published.

No database. Files upload straight from the browser to Google Drive. Slate only ever sees the files it creates.

## The workflow

```
Idea -> Script -> Shoot -> Edit   (Ideas board)      Ready -> Scheduled -> Published   (Uploads)
```

- **Ideas**: a board for videos in production. A new idea is a title and a description; open it to write the script (with a built-in teleprompter), link footage, and move it along.
- **Library**: Drive for creators. **Raw footage** and **Edited** spaces with your own nested folders, thumbnails, drag-and-drop move, rename, share with an editor (by email or link), search, grid and list views. Every upload asks whether it is raw or edited and where it belongs.
- **Send to Uploads**: one click turns an edited file in the Library into a video with a checklist, a date and a place in the pipeline.
- **Uploads**: the YouTube pipeline. Overdue, **Upcoming**, ready to schedule and previously **Published**, as a list or a calendar. Open a video for its title, description, pinned comment, tags, thumbnail, files and publish checklist.
- **Publish mode**: download the final, copy each field in YouTube Studio's order, paste the link back.
- **Custom video player** that streams from Drive: glass controls, scrubbing with note markers, speed, frame-step, picture in picture, resume where you stopped, keyboard shortcuts, and timestamped review notes.
- **Download** anything from the app, with live progress.
- **Home**: a "do this next" with a button that goes straight to it, what is blocked, and the week ahead.
- **Demo mode**: sample videos and a real player, stored only in the browser.

## How it is built

| Part | Choice |
|---|---|
| Web app | Vite, React 19, TypeScript, React Router, Tailwind CSS v4, Zustand |
| UI | Hand-built on Radix Dialog and cmdk. No templates |
| Motion | View Transitions API between pages. CSS 3D and one scroll listener on the landing page. No animation libraries |
| Storage | The user's Google Drive, scope `drive.file` (Slate can only touch files it created). One `slate.db.json` holds the text data |
| Sign-in | `frontend/api/`: seven small Vercel Functions in plain Node, no dependencies. The refresh token lives only in an AES-256-GCM encrypted, httpOnly cookie in the user's own browser |
| Hosting | Everything on Vercel (static site plus functions), so it is always on and the session cookie is first-party |

```
frontend/
  src/lib/              types, Drive adapter, demo adapter, vault store, transfers (upload + download), workflow rules, auth client
  src/components/       shell, video player, teleprompter, dialogs (upload, move, share, send-to-uploads), UI primitives
  src/pages/            Landing, Home, Ideas, Library, Uploads, VideoDetail, Settings, Legal
  api/                  Vercel Functions: /api/health, /api/auth/{login,callback,token,logout}, /api/drive/init, /api/yt
  api/_lib/core.js      the shared sign-in logic (the _lib folder is not routed)
  dev-api.mjs           local runner for the functions
```

## Run it locally

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  ("Try the demo" works with no setup)
```

To use real Google sign-in locally, copy `frontend/.env.example` to `frontend/.env`, fill it in, add `http://localhost:5173` as an authorized origin and `http://localhost:5173/api/auth/callback` as a redirect URI on the Google client, then run in a second terminal:

```bash
cd frontend
npm run api
```

## Deploy (all free tiers)

### 1. Google Cloud (about 15 minutes, no billing account needed)

1. Create a project at <https://console.cloud.google.com> and enable the **Google Drive API** (and **YouTube Data API v3** for view counts, optional).
2. **Google Auth Platform**: set up the consent screen as **External**. Add your home page, privacy (`/privacy`) and terms (`/terms`) links and the authorized domain. Under **Data Access** add only `openid`, `userinfo.email`, `userinfo.profile` and `drive.file`.
3. **Audience > Publish app**, so the status is **In production**. In *Testing*, sign-ins expire after 7 days.
4. **Clients > Create client**: Web application, with your site as the authorized JavaScript origin and `https://YOUR-DOMAIN/api/auth/callback` as the redirect URI. Keep the downloaded JSON in a `secret/` folder (it is git-ignored).
5. Optional: an API key restricted to the YouTube Data API v3, used as `YT_API_KEY`.

### 2. Vercel

1. Import the repository and set **Root Directory** to `frontend` (framework preset: Vite).
2. Add these Environment Variables (mark the secrets **Sensitive**):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN` (your site, for example `https://slate.example.com`, no trailing slash), `COOKIE_SECRET` (any random string of 32+ characters), and optionally `YT_API_KEY`.
3. Deploy. Pushes to `main` redeploy automatically.
4. Optional custom domain: add it in the project's Domains tab and create the DNS records Vercel shows. Update the Google client's origin and redirect URI to match, and `APP_ORIGIN`.

There is nothing to keep awake: Vercel Functions start on demand in milliseconds, with no sleep and no separate server.

## Costs

Nothing here needs a paid plan or a card. Things to know:

- **Storage is the user's own Google storage.** Slate shows the real quota from Google. If an account fills up, Google stops new uploads until space is freed or the Google plan is changed.
- **Vercel's free plan is for non-commercial use.** If Slate is ever sold, move to a plan or host that allows that.
- The functions only run for a few milliseconds per sign-in or token refresh, far inside free limits for a personal tool.

## Security notes

- Scope is `drive.file` only: Slate cannot read anything in Drive that it did not create.
- OAuth uses the authorization-code flow with PKCE and a state check. State-changing endpoints need a custom header and a matching `Origin`.
- The client secret and refresh token never reach browser JavaScript. The access token (1 hour) is held in memory only.
- Secrets live in Vercel as Sensitive environment variables and in a git-ignored `secret/` folder locally; `.env*` files (except `.env.example`) are git-ignored too.
- `frontend/vercel.json` sets a Content-Security-Policy and standard hardening headers.

## Status

Built and tested in demo mode end to end (create, upload, kit, board, calendar, publish). The live sign-in path is deployed and its redirect, cookie flags and rejections are verified. A full real-account round trip (sign in, then a multi-chunk upload to Drive) is the first thing to verify after any change to the credentials.
