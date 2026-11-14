import { ArrowLeft } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '../components/ui'

const UPDATED = '14 November 2026'

function H({ children }: { children: ReactNode }) {
  return <h2 className="display mt-10 text-[24px] text-paper">{children}</h2>
}

const PRIVACY = (
  <>
    <p>Slate is a personal tool for organising video projects. It is built so that your files and your writing stay in your own Google Drive.</p>
    <H>What Slate can access</H>
    <p>
      When you sign in with Google, Slate asks for your basic profile (name, email address, profile picture) and for the Google Drive permission called <code>drive.file</code>. That permission lets Slate see and manage <b>only the files and folders Slate itself creates</b>. It cannot see or change anything else in your Drive.
    </p>
    <H>Where your data lives</H>
    <p>Your videos, thumbnails, publish kits and notes are stored in a folder named “Slate” in your own Google Drive. File uploads go directly from your browser to Google. Slate has no database and keeps no copy of your files or text.</p>
    <H>What the sign-in server holds</H>
    <p>To keep you signed in, a small server exchanges Google's sign-in code for tokens. The long-lived token is stored only inside an encrypted, http-only cookie in your own browser. The server does not store it, and does not log your files, titles or descriptions.</p>
    <H>Cookies and local storage</H>
    <p>Slate uses one encrypted session cookie for sign-in. Your browser also keeps a local cache of your vault's text so the app opens instantly, plus small preferences such as your chosen layout. There is no advertising and no third-party tracking.</p>
    <H>YouTube statistics</H>
    <p>If you paste a YouTube link into a published video, Slate may request that video's public view, like and comment counts from the YouTube Data API. Slate never posts, uploads or changes anything on your channel.</p>
    <H>Removing access and deleting data</H>
    <p>
      Signing out revokes Slate's access. You can also remove it at any time from your Google Account permissions page. To delete your data, delete the “Slate” folder in your Drive. Demo mode stores sample data only in your browser and sends nothing anywhere.
    </p>
    <H>Limited Use</H>
    <p>Slate's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Data is used only to provide the features you see in the app, is not sold, and is not used for advertising.</p>
  </>
)

const TERMS = (
  <>
    <p>Slate is provided free of charge as a personal project, as is, without warranties of any kind.</p>
    <H>Your content</H>
    <p>Everything you add stays yours and stays in your own Google Drive. You are responsible for what you store and for having the rights to it.</p>
    <H>Your storage</H>
    <p>Slate uses the storage of the Google account you sign in with. If that account runs out of space, uploads stop until you free space or change your Google plan. Slate does not sell storage and receives nothing if you upgrade with Google.</p>
    <H>Keep your own backups</H>
    <p>Slate verifies that an uploaded file's size matches the original, but it is not a backup service. Do not delete the only copy of important footage until you have confirmed the file opens from Drive.</p>
    <H>Availability</H>
    <p>The service may change, pause or stop at any time. Because your data lives in your Drive, it remains available to you without Slate.</p>
    <H>Acceptable use</H>
    <p>Do not use Slate to break the law or Google's terms, or to interfere with the service for other people.</p>
  </>
)

export default function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const title = kind === 'privacy' ? 'Privacy' : 'Terms'
  useEffect(() => {
    document.title = `${title} · Slate`
    window.scrollTo(0, 0)
    return () => {
      document.title = 'Slate: every video, ready to publish'
    }
  }, [title])

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="Slate home">
          <Logo />
        </Link>
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-mute hover:text-paper">
          <ArrowLeft size={15} /> Back
        </Link>
      </div>
      <h1 className="display mt-14 text-[clamp(40px,7vw,64px)]">{title}</h1>
      <p className="label mt-3">Last updated {UPDATED}</p>
      <div className="mt-8 grid gap-4 text-[16px] leading-relaxed text-mute [&_b]:text-paper [&_code]:rounded [&_code]:bg-panel [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-lime">
        {kind === 'privacy' ? PRIVACY : TERMS}
      </div>
      <p className="mt-14 text-[13px] text-dim">
        <Link to={kind === 'privacy' ? '/terms' : '/privacy'} className="ulink">
          {kind === 'privacy' ? 'Terms' : 'Privacy'}
        </Link>
      </p>
    </div>
  )
}
