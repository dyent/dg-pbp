# Setting Up AI (Anthropic API Key)

*Phase 3 step 2 (DECISIONS.md #47). Needed before adventure import works. The key is yours and
costs you money, so it stays on the server and never goes in the code, the database or a chat.*

## Who can use AI

Only the **server admin** (you), and only in campaigns you GM. Other GMs on your server see "AI
import is available only to the server admin". Players never see any of it.

Locally, the test GM `handler@example.test` was made server admin so you can try it. On the real
server you will make your own account server admin when we set up hosting.

## 1. Create the key, with a spending limit (on Anthropic's site)

1. Sign in at <https://console.anthropic.com> (a separate account from a Claude.ai subscription).
2. Add a small amount of prepaid credit under **Billing**, for example $5–$10.
3. Under **Limits** (spend limits), set a **monthly limit** a little above our own cap, so even a
   mistake in our code can't spend more.
4. Under **API keys**, create a key named something like `dg-pbp`. Copy it; Anthropic shows it once.
   Keep it out of chat messages, email and screenshots.

## 2. Give it to the local server

1. In `C:\dev\dg-pbp\supabase\functions\` create a file named `.env` (git ignores it) containing one
   line:

   ```text
   ANTHROPIC_API_KEY=paste-your-key-here
   ```

2. Restart the local stack so the server functions read it:

   ```powershell
   npm run supabase:down; npm run supabase:up
   ```

3. In the app, open **Case files → Sources (GM only)** and press **Test the connection**. You should
   see *Connected. Claude replied "Connection OK"* and a cost of a fraction of a cent.

## 3. On the real server (later, with hosting)

The same key is set as a hosted secret instead of the `.env` file, for example
`npx supabase secrets set ANTHROPIC_API_KEY=…` (you run it yourself), and `ALLOWED_ORIGINS` is set
to the app's web address.

## The cap and the usage log

- **AI this month** shows what has been spent this calendar month (UTC) against the **monthly cap**
  (default $5). When the cap is reached, AI calls stop until next month or until you raise it.
- Every call is logged (feature, model, tokens, estimated cost) in `ext_ai_usage`. Costs are
  estimates from Anthropic's list prices; Anthropic's own billing page is the final word.
- Calls use **Claude Sonnet 5.5**. If it declines a request, Anthropic's *fallbacks* feature
  automatically retries on a suitable model in the same call (`fallbacks: "default"`).

## If the test fails

| Message | What to do |
|---|---|
| No Anthropic API key has been set on the server yet | Check the `.env` file and its file name, then restart the stack |
| Anthropic rejected the API key | Copy the key again from Anthropic; check for spaces |
| Anthropic is busy or your account limit was reached | Wait, or check credit and limits on Anthropic's site |
| This month's AI spending cap has been reached | Raise the cap in the AI box, or wait until next month |
| The AI server function is not running | Restart the local stack (`npm run supabase:down; npm run supabase:up`) |

<!-- cspell:locale en-GB,en -->
