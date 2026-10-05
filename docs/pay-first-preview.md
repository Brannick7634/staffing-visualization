# Pay-first homepage preview (branch `preview/pay-first-redesign`)

Local, development-only preview of the redesigned Staffing Signal homepage. Not deployed, not pushed, nothing written to Airtable, no email sent.

## Run it

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/preview` (Variant A, close to the approved image) or `/preview/b` (Variant B, phone/conversion-first). Other pages: `/preview/methodology`, `/preview/free-access`, `/preview/preferences`, `/preview/states` (synthetic interaction-states lab). `npm test` runs the Node built-in test suites.

The `/preview` route exists only under `vite dev` (`import.meta.env.DEV`). A production build contains no preview code.

## What is real vs simulated

| Works for real | Simulated / development-only |
|---|---|
| Server-side gating: signed-out responses contain only national pay, top 5 heating states, top 3 cities. Locked rows are never sent to the browser. | Signed-in state: a dev cookie (`ssp_sim_access`) honored only by the Vite dev middleware. |
| Privacy rule in code: at least 5 distinct firms, no firm over 50% (exactly 50% passes), applied per metric; unknown checks fail closed. | Signup: validates name and work email and returns a fake ID. Nothing is saved and no email is sent. |
| Verdict math: integer cents, three categories, and one true dollar scale for every marker. | "Tell me when available" and Preferences: acknowledged, not stored. |
| Honest states: loading, error, out-of-date, not available, insufficient sample, state fallback, locked local. | Data: the supplied October fixture (`dev-fixtures/`), labeled "Development example". The States Lab uses synthetic "Example City, EX" data. |
| Production entrypoints `api/signal/{snapshot,pay}.js` exist and fail closed with 503 until a verified feed is connected. | |

The visitor's entered pay rate never leaves the browser. The server returns the benchmark and the verdict is computed client-side. The rate is not put in URLs, storage, or analytics.

## Changed files

- **Edited:** `src/App.jsx`, `vite.config.js`, `package.json`.
  - `App.jsx`: every page is lazy-loaded, so the main bundle dropped from 4.3 MB to 186 KB. The `/preview/*` route is dev-only.
  - `vite.config.js`: dev API plugin, plus `server.fs.deny` for fixtures and server code.
  - `package.json`: test script.
- **New:** `shared/signal/` (pure pay and validation logic), `api/_lib/signal/` and `api/signal/` (gate, service, handlers), `dev/signal/` (fixture adapter, simulated access, synthetic scenarios, Vite plugin), `dev-fixtures/`, `src/preview/`, `tests/`.

## Remaining production work (needs Andy's approval before any of it)

1. **Verified aggregate feed.** Build a pipeline step that writes publishable aggregates and their privacy metadata (firm count, max share, calculation version, snapshot date). Plug it into `api/_lib/signal/productionAdapter.js`.
   - Fix the "new posting" definition (use `COALESCE(posting_date, first_seen)`).
   - Choose and document a quantile method. Forklift P25 is $17.13 with the exclusive method and $17.31 with linear interpolation.
   - Add the 50% share check to demand metrics.
   - **Built 2026-10-04 (not deployed):** `scripts/export_signal_snapshot.py` (calc `signal-agg-1.0.0`: exclusive quartiles, COALESCE new-posting date, 5-firm/50% rule on every metric incl. demand) writes `api/_lib/signal/data/signal-snapshot.json`; `productionAdapter.js` validates it and still returns 503 unless `SIGNAL_FEED_ENABLED=1`, and on any missing/stale (>10 days)/invalid snapshot. Each weekly refresh needs a commit + deploy of that one file.
2. **Real signup.** Server-side validation, then idempotent writes to a dedicated subscribers table. Do not use the current `Staffing Signal Leads Table (Test)`. Preserve unsubscribes. Use a newsletter tool kept separate from the cold-email tools.
   - Decide how identity is verified (magic link?).
   - Send the session token on `/api/signal/*` requests.
3. **Fix existing-site exposures before any gated launch.**
   - Public `/api/firms` and GET `/api/dashboard-metrics` return firm-level rows.
   - Anonymous POST `/api/dashboard-metrics` deletes and recreates Airtable rows.
   - Unescaped `filterByFormula`.
   - `/api/protected-firms` trusts a segment sent in the request body.
   - No rate limits.
4. **Data rights.** Confirm JobsPipe and OpenWebNinja terms for public display, caching, and email redistribution.
5. **Decisions for Andy.**
   - Should the newsletter checkbox be checked by default? (It currently is.)
   - Final About copy.
   - Logo asset. The existing logo is a dark neon PNG; the preview uses an inline bars-and-serif wordmark.
   - Re-enable a Share link (without the rate)?
   - Pick Variant A or B.
