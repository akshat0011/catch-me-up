# Catch Me Up

**Stepped away from a live match? Get back in the game in 20 seconds.**

Most fans don't watch every ball. Work, commutes and chai breaks mean they drop in and out. When they come back,
the scoreboard says `142/5`. It doesn't say that India lost two wickets in six quiet overs and their win chance
slid from 87% to 63%. Catch Me Up rebuilds the *story* of what you missed. It works in your language and leads with
your team and your fantasy players, and then you can ask follow-ups.

## Try it

1. Pick a match: **India vs Pakistan**, Asian Games final (3 Oct 2026), or **India vs South Africa**, T20 World
   Cup final 2024. Both are real ball-by-ball data, replayed as if live.
2. Tap **☕ Step away**. The match jumps ahead without you. Switching browser tabs for a while does the same thing.
3. Tap **⚡ Catch me up**. Switch language (Hinglish, हिंदी, தமிழ், తెలుగు, বাংলা, मराठी, ಕನ್ನಡ) or style
   (20-sec / Dost mode / Analyst).
4. Ask a follow-up ("can we still win?"), listen to it, or share it to WhatsApp.

## How it works

```
ball-by-ball data ──► cricket engine (deterministic)  ──► fact sheet ──► Gemini ──► streamed recap
                      score state · win-chance model        (only balls        headline · turning point
                      key moments · biggest swing           up to "now")       right now · watch next
```

- **`shared/engine.ts`** turns deliveries into match state, scorecards, a DLS-style win-chance model,
  key moments (wickets, big/tight overs, milestones) and the over with the biggest swing.
- **`shared/context.ts`** builds the fact sheet the model sees. The UI's "Show the facts the AI was given"
  button shows exactly that text.
- **`api/catchup.ts`, `api/ask.ts`** are Vercel Functions (Node.js runtime, streaming). The client sends only a match id, a ball
  range and preferences. The server owns the data and the prompt, validates the input and streams Gemini's text back.
- **Guardrails:** the model only ever sees balls up to "now", so it can't spoil the match even when it knows how the
  real game ended. It's told not to invent shot details or stats. If the AI is unavailable, the app falls back to a
  data-only summary.

Model: Google Gemini (`gemini-3.5-flash`, minimal thinking, so the first words arrive in about a second), via the
Gemini REST API. Override it with `GEMINI_MODEL`. Match data: [Cricsheet](https://cricsheet.org) (ODC-BY).

## Run locally

```bash
npm install
echo "GEMINI_API_KEY=your-key" > .env   # or create the file in an editor
npm run dev
```

`node scripts/facts.mjs t20wc-2024-final 1 12 18 India` prints the fact sheet for a given window.

## Deploy

```bash
npx vercel deploy --prod
npx vercel env add GEMINI_API_KEY production
```

---

An independent prototype built for a Dream11 Forward Deployed Engineer internship application. It is not affiliated
with or endorsed by Dream11.
