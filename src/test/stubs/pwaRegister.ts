// DG-EXT: test-only stand-in for vite-plugin-pwa's `virtual:pwa-register`.
// On Windows, Vitest resolves the plugin's virtual module id to an invalid
// `file:///@vite-plugin-pwa/...` URL, so every suite that imports the app
// shell fails to load. vite.config.ts aliases the id to this file on win32
// only; Linux/CI keep the real module. Under jsdom the real registerSW never
// registers a worker either, so a no-op matches its observable behavior.
// Tests that exercise registerSW (src/lib/pwaUpdate.test.ts) vi.mock it.
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
