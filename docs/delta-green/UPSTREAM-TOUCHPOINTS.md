# Upstream Touchpoints

Every place we edit an **upstream** file is listed here, so merge conflicts are quick to resolve.
Each edit in code is marked with `// DG-EXT:` (TypeScript) or `-- DG-EXT:` (SQL).

| Upstream file | What we changed | Why |
|---|---|---|
| `vite.config.ts` | `fileURLToPath` import; win32-only `test.alias` for `virtual:pwa-register` → `src/test/stubs/pwaRegister.ts` | Vitest on Windows can't resolve the PWA plugin's virtual module, so 4 suites failed to load |
| `src/tokenAdoption.test.ts` | `readSource` normalises `\` to `/` in `rel` | Allowlist uses POSIX paths; failed on Windows |
| `src/features/marketing/FeaturesPage.test.tsx` | `assertThumbsOnDisk` derives the full-size path from the URL, not the OS path | `'/thumbs/'` replace didn't match Windows paths |
| `scripts/usage-report/run.test.ts` | `describe.skipIf(process.platform === 'win32')` | Script needs POSIX + `jq`; it's upstream's own hosted-project tool |

New file (no conflict risk): `src/test/stubs/pwaRegister.ts`. All four edits are cross-platform
fixes with identical Linux behaviour, so they're good candidates to offer upstream as a pull request.
If upstream accepts them, this table shrinks.

Root-level files added by us (no conflict risk): `CLAUDE.md`, `docs/delta-green/*`.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words Touchpoints TOUCHPOINTS -->
