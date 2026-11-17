# Phase 1 Setup Guide (Windows)

Work through these in order. Each step says how to check it worked. Stop and tell Claude if any
step shows an error. Paste the error text.

Machine check (2026-11-16): winget ✅ · 228 GB free ✅ · WSL ❌ not installed · **Virtualisation ❌
reported disabled** · Git ❌ · Node 22 (need 26) · Docker ❌

---

## Step 0: Enable virtualisation (only if needed)

Docker needs your CPU's virtualisation feature switched on in the BIOS/UEFI.

1. Open **Task Manager → Performance → CPU**. Look at **"Virtualization:"** at the bottom right.
2. If it says **Enabled**, skip to Step 1.
3. If it says **Disabled**: restart the PC and enter BIOS/UEFI setup (usually F2, Del or F10 during
   start-up; or *Settings → System → Recovery → Advanced start-up → Restart now → Troubleshoot →
   Advanced options → UEFI Firmware Settings*). Find the setting called **Intel Virtualization
   Technology (VT-x)**, **AMD-V** or **SVM Mode**, set it to **Enabled**, save, and exit.
   The exact menu names vary by motherboard/laptop maker. Search "<your PC model> enable
   virtualization" if you can't find it.

✔ Check: Task Manager shows *Virtualization: Enabled*.

## Step 1: Install WSL (Windows Subsystem for Linux)

Docker Desktop uses WSL2 behind the scenes. Open **PowerShell as Administrator** (right-click
Start → *Terminal (Admin)*) and run:

```bash
wsl --install --no-distribution
```

Then **restart the PC**.

✔ Check (normal PowerShell): `wsl --status` no longer says "not installed".

## Step 2: Install the tools

In a normal (non-admin) PowerShell window, run each line. Accept any Windows permission prompts.

```bash
winget install --id Git.Git -e
```

```bash
winget install --id Schniz.fnm -e
```

```bash
winget install --id GitHub.cli -e
```

```bash
winget install --id Docker.DockerDesktop -e
```

- **Git**: version control. Also provides the `sh` shell that the project's scripts need.
- **fnm**: lets you install the exact Node.js version the project wants.
- **GitHub CLI (`gh`)**: lets Claude/you work with GitHub from the terminal.
- **Docker Desktop**: runs the local Supabase database.

**Close and reopen PowerShell** afterwards so the new commands are found. Start **Docker Desktop**
once from the Start menu, accept its terms, and choose the free "Personal" use. Leave it running.

✔ Check: `git --version`, `fnm --version`, `gh --version`, `docker --version` all print versions.

## Step 3: Set up Node 26

Make PowerShell load fnm automatically (run once):

```bash
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force }; Add-Content $PROFILE 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
```

Reopen PowerShell, then:

```bash
fnm install 26
```

```bash
fnm default 26
```

✔ Check: `node --version` prints `v26.x.x`.

> If PowerShell complains that "running scripts is disabled", run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then reopen PowerShell.

## Step 4: Tell Git who you are

```bash
git config --global user.name "Your Name"
```

```bash
git config --global user.email "the-email-you-use-on-github"
```

```bash
git config --global core.autocrlf input
```

(The last line stops Windows line endings from breaking the project's shell scripts.)

## Step 5: Fork the repository on GitHub

1. Sign in at github.com.
2. Open <https://github.com/alvarocavalcanti/ttrpgpbp> and click **Fork** (top right).
3. Keep the default name (or call it `dg-pbp`), then click **Create fork**.
4. In **your fork**: **Settings → Actions → General → Disable actions**. Upstream's workflows try to
   deploy to *their* servers and would just fail on your fork. We'll set up our own later.

## Step 6: Log in to GitHub from the terminal and clone

```bash
gh auth login
```

(Choose GitHub.com → HTTPS → Login with a web browser.)

```bash
git clone https://github.com/YOUR-USERNAME/ttrpgpbp.git C:\dev\dg-pbp
```

```bash
cd C:\dev\dg-pbp
```

```bash
git remote add upstream https://github.com/alvarocavalcanti/ttrpgpbp.git
```

```bash
git remote set-url --push upstream DISABLED
```

The last line is a safety catch: you can *pull* from the original project but can never
accidentally *push* to it.

✔ Check: `git remote -v` shows `origin` = your fork and `upstream` = alvarocavalcanti.

## Step 6b: Let npm use Git Bash (done by Claude on 2026-11-17)

```bash
npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
```

The database scripts are Unix shell scripts. This tells npm to run them with Git Bash.

## Step 7: Hand back to Claude

Open `C:\dev\dg-pbp` as the working folder in Claude Code (and in VS Code), then tell Claude
"setup done". Claude will then:

1. Copy these `docs/delta-green/` files into the fork.
2. Run `npm install` and `npm run supabase:up` (starts the local database in Docker).
3. Run the app locally and run upstream's tests for a green baseline.
4. Write `CLAUDE.md` and make the first commit.

The old OneDrive folder `TTRPG-AiAssistant\ttrpgpbp-main` can be deleted after that.

---

### Later (not now): Google sign-in

Locally you don't need Google at all. Test users can be created in the local Supabase Studio
(<http://localhost:54323>). Google sign-in gets set up when we create the hosted Supabase project
for real play: a free OAuth client in Google Cloud Console pointing at your Supabase URL. Claude
will walk you through it at that point.

<!-- cspell:locale en-GB,en -->
<!-- cspell:words winget UEFI Schniz fnm -->
