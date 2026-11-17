// FORK-EXT: the app's display name on screen (browser tab titles, sign-in page,
// landing-page banner, install prompt).
//
// Set VITE_APP_NAME per deployment, like upstream's VITE_SITE_URL /
// VITE_CONTROLLER_NAME. Locally it lives in the gitignored
// `.env.development.local`, which Vite reads for `npm run dev` but not for tests,
// so upstream's tests keep seeing the default name. Upstream's own credit (About
// page, legal pages) deliberately keeps "Role by Post".

export const UPSTREAM_APP_NAME = 'Role by Post'

export function resolveAppName(configured: unknown): string {
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : UPSTREAM_APP_NAME
}

export const APP_NAME = resolveAppName(import.meta.env.VITE_APP_NAME)
