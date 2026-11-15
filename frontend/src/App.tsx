import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from './components/ui'

// Each page is its own chunk, so the landing page ships none of the app and vice versa.
const load = {
  Landing: () => import('./pages/Landing'),
  Shell: () => import('./components/Shell'),
  Home: () => import('./pages/Home'),
  Ideas: () => import('./pages/Ideas'),
  Library: () => import('./pages/Library'),
  Uploads: () => import('./pages/Uploads'),
  VideoDetail: () => import('./pages/VideoDetail'),
  Settings: () => import('./pages/Settings'),
  Legal: () => import('./pages/Legal'),
}
const Landing = lazy(load.Landing)
const Shell = lazy(load.Shell)
const Home = lazy(load.Home)
const Ideas = lazy(load.Ideas)
const Library = lazy(load.Library)
const Uploads = lazy(load.Uploads)
const VideoDetail = lazy(load.VideoDetail)
const Settings = lazy(load.Settings)
const Legal = lazy(load.Legal)

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="label">404</p>
        <h1 className="display mt-3 text-[clamp(40px,8vw,84px)]">Nothing on this slate.</h1>
        <Link to="/" className="btn btn-primary mt-7">Back to the start</Link>
      </div>
    </div>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/privacy', element: <Legal kind="privacy" /> },
  { path: '/terms', element: <Legal kind="terms" /> },
  {
    path: '/app',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'ideas', element: <Ideas /> },
      { path: 'library', element: <Library /> },
      { path: 'uploads', element: <Uploads /> },
      { path: 'v/:id', element: <VideoDetail /> },
      { path: 'settings', element: <Settings /> },
      // pages from the first version of Slate
      { path: 'videos', element: <Navigate to="/app/ideas" replace /> },
      { path: 'calendar', element: <Navigate to="/app/uploads?view=calendar" replace /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  // Once the first screen is up, fetch the remaining page chunks in the background so
  // every later navigation is instant.
  useEffect(() => {
    const id = setTimeout(() => Object.values(load).forEach((f) => void f().catch(() => {})), 1200)
    return () => clearTimeout(id)
  }, [])

  return (
    <Suspense fallback={<div className="min-h-dvh bg-carbon" />}>
      <RouterProvider router={router} />
      <Toaster />
    </Suspense>
  )
}
