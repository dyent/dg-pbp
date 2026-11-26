# Putting the app online

Decided with the owner on 2026-11-26 (DECISIONS.md #52):

- **Supabase Free** (database, sign-in, files, server functions), region **Sydney**, the closest
  to Hobart. A small GitHub job pings it every three days so the free project isn't paused.
- **Cloudflare Pages** (free) for the app itself, on a free `<name>.pages.dev` address.
- **Google sign-in only** to start. Email sign-in links need an email service and a domain.

Every push to `main` then updates the site by itself: new migrations, server functions and the app
(`.github/workflows/ext-deploy.yml`). Upstream's own workflows stay switched off.

You create the accounts and copy the keys. Claude can't sign up for things for you or handle
passwords and keys. **Never paste a key or password into the chat**: put them straight into the
websites below.

Keep a private note (a password manager is best) as you go. You'll collect:

| What | Where it comes from |
|---|---|
| Database password | You choose it when creating the Supabase project |
| Project ref (about 20 letters) | Supabase → Project Settings → General |
| Project URL, `anon` / publishable key | Supabase → Project Settings → API (or *Connect*) |
| Supabase access token | Supabase → your avatar → Account → Access Tokens |
| Google client ID and secret | Google Cloud, step B |
| Cloudflare account ID and API token | Cloudflare, step C |

## A. Supabase project

1. Sign up at <https://supabase.com> (signing in with GitHub is easiest).
2. **New project**: name `dg-pbp`, region **Asia-Pacific (Sydney)**, Free plan. Generate a strong
   database password and save it.
3. Note the project ref, project URL and `anon` (publishable) key. Create an **access token**
   (Account → Access Tokens, name it `github-deploy`).

   Steps A4 to A6 need the app's address, so pick the Cloudflare name first (step C1). If you choose
   `dg-pbp`, the address is `https://dg-pbp.pages.dev`.

4. **Authentication → URL Configuration**: Site URL `https://<name>.pages.dev`; add a redirect URL
   `https://<name>.pages.dev/**`.
5. **Authentication → Sign In / Providers**: turn **Email** off (Google only for now). Turn
   **Google** on once you have the client ID and secret from step B.
6. **Edge Functions → Secrets**: add
   - `ALLOWED_ORIGINS` = `https://<name>.pages.dev`
   - `ANTHROPIC_API_KEY` = a **new** key from the Anthropic console, separate from your local one,
     so either can be revoked on its own.

## B. Google sign-in

1. Go to <https://console.cloud.google.com> and create a project named `dg-pbp`.
2. **Google Auth Platform → Branding**: app name (e.g. "Role by Post by Dylan") and your support
   email. **Audience**: External. While it is in *Testing*, only the Google accounts you add as
   test users can sign in. That suits a small group; add each player's Gmail address.
   (*Publish app* opens it to anyone with the link, without a review, since it only asks for
   name and email.)
3. **Clients → Create client → Web application**:
   - Authorised JavaScript origins: `https://<name>.pages.dev`
   - Authorised redirect URI: `https://<project ref>.supabase.co/auth/v1/callback`
4. Copy the **client ID** and **client secret** into Supabase (step A5).

## C. Cloudflare

1. Sign up at <https://dash.cloudflare.com> (free). **There is nothing to create in Cloudflare**:
   just decide a project name such as `dg-pbp`. It becomes the address `<name>.pages.dev`, must
   be unique (have a second choice ready), and goes into GitHub in step D. The first deploy
   creates the project.
2. Note your **account ID**: the **⋯** next to your account name on the dashboard home →
   *Copy account ID*; or the 32-character code after `dash.cloudflare.com/` in the address bar.
3. Person icon (top right) → **Profile → API Tokens → Create Token → Custom token**: name
   `github-deploy`, permission *Account → Cloudflare Pages → Edit*, Account Resources *Include*
   your account. Copy the token (it is shown once).

## D. GitHub settings

In <https://github.com/dyent/dg-pbp> go to **Settings → Secrets and variables → Actions**.

**Secrets** tab (*New repository secret* for each):

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase access token |
| `SUPABASE_DB_PASSWORD` | Database password |
| `SUPABASE_PROJECT_ID` | Project ref |
| `VITE_SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | `anon` / publishable key |
| `VITE_CONTROLLER_NAME` | Your name as shown in the privacy policy |
| `VITE_CONTROLLER_EMAIL` | A contact email shown in the privacy policy (it is public) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

**Variables** tab:

| Name | Value |
|---|---|
| `CLOUDFLARE_PROJECT_NAME` | e.g. `dg-pbp` |
| `VITE_SITE_URL` | `https://<name>.pages.dev` |
| `VITE_APP_NAME` | `Role by Post by Dylan` |

Under **Actions** (left menu, or the Actions tab), check that Actions are allowed. Upstream's
*Deploy to Cloudflare Pages*, *Apply Migrations* and *Cleanup images* workflows should stay
**disabled**.

## E. First deploy

Actions tab → **Deploy (fork)** → **Run workflow**. It takes about 5 to 10 minutes. If a step
fails, tell Claude its name; the log never shows the secrets.

## F. After the first deploy

1. Open `https://<name>.pages.dev`, sign in with Google, accept the Terms.
2. Make yourself server admin: Supabase → **SQL Editor**, run (with your Gmail address):

   ```sql
   update profiles set server_admin = true
   where id = (select id from auth.users where email = 'you@gmail.com');
   ```

3. In the app's **Admin** page, switch on **image uploads** (needed for Post in chat and
   portraits) and check the **AI monthly cap**.
4. Create the campaign, upload your sources and handouts again, and invite the players (as Google
   test users first, step B2).

## Not set up yet

- **Backups.** Supabase Free keeps **no backups**. A scheduled backup job is the next step after
  going online (upstream's `docs/BACKUP_RESTORE.md` describes the manual way).
- **Push notifications** (need their own keys and database settings).
- **Email sign-in** (needs a domain and an email service).
- **Old-image clean-up** (upstream's job; images are kept for now).

From the first deploy onwards, **migrations that have been applied are never edited**; any fix
is a new migration.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words publishable keepalive -->
