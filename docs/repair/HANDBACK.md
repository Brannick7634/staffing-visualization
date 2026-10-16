# Staffing Signal repair — handback (2026-10-16)

Branch `repair/staffing-signal-2026-10` (worktree `C:\Users\andyb\dev\sv-repair`), cut from `origin/master` b3baf82. Not pushed, merged or deployed.
Tests: baseline 492/492 → now 517/517 (`npm test`, includes 19 Python fixture tests). `npm run build` passes.

Companion docs: `COVERAGE_IMPACT.md`, `DATA_CONTRACT.md`, `ANALYTICS_EVENTS.md` in this folder.

## Status table

| # | Issue | Before | After | Files | Tests | Status | Blocker |
|---|---|---|---|---|---|---|---|
| 2a | Annual pay converted to hourly | 20,043 annual (+482 monthly/weekly/daily) admitted | Only originally-hourly USD pay | scripts/signal_population.py, export_signal_snapshot.py | Python fixtures | Implemented, verified on local data | Rules need Andy's approval |
| 2b | Firms admitted unless excluded | 10,296 unknown + 4,731 conflicting admitted | Positively verified staffing firms only; 113 name-equivalent firms merged | same | fixtures | Implemented | No maintained approval list exists |
| 2c | Temp/contract evidence | 30,206 admitted with none | Contract/temporary labels required; ambiguous held out | same | fixtures | Implemented | — |
| 2d | Small samples vs confidence | 330 cells on exactly 3 obs | Rule unchanged (3 firms / 50%); counts + limited-sample notes shown; 10-obs standard **proposed, not active** | api/_lib/signal/* | node tests | Implemented | Approve new standard? |
| 2e | Version / history | 1.2.0, trend continuous | 2.0.0; old snapshots refused; trend withheld at method break | api/_lib/signal/*, data/ | node tests | Implemented | **Live feed shows "unavailable" until a 2.0.0 snapshot is published** |
| 2f | Report / PDF / email / methodology text | 2,080-hr conversion described | Aligned to 2.0.0 | report.js, MethodologyPage.jsx, footnotes | tests | Implemented | PDF layout not visually checked |
| 3 | Analytics | Dev console only | Disabled-by-default adapter, allowlist, no IDs, attempt/failure/success | src/preview/lib/track.js + callers | 20 new tests | Implemented | **Blocked**: no analytics tool configured |
| 4 | Compare → report journey | Gate before compare | Compare Client Pay without account; separate Create Report; immediate signup form; market kept; stale-input block; double-submit guard | Calculator, PreviewContext, ResultCard, ReportAuthModal, SignupForm, reportGate | tests | Implemented, not browser-tested | Newsletter pre-check = consent decision |
| 5 | Coverage labels | Implicit | City/state/nationwide label + unavailable-city wording; only passing fallbacks offered | ResultCard etc. | tests | Implemented, not browser-tested | — |
| 6 | Homepage + About | — | Brief copy, About Andy Kohler in nav/footer; contact hidden | src/preview/* | tests | Implemented | **No contact destination** (`VITE_CONTACT_URL`) |
| 7 | Metadata / loading | Blank root, no OG | Title, description, canonical www.thestaffingsignal.com, OG/Twitter, noindex on private routes, loading shell | index.html, vercel.json, public/og-image.png | build | Implemented | Crawler check after deploy |
| 7 | Mobile / a11y / perf | — | — | — | — | **Not tested** | Local preview server was blocked in this session |
| 1 | Domains | — | apex→www is 307 (should be 308, Vercel setting); staffingsignal.com does not resolve | — | curl | Verified (read-only) | Do you own staffingsignal.com? |
| 1 | Preview safety | — | Branch push likely makes a Vercel preview; API reads DATABASE_URL / RESEND / Airtable with no env split | — | — | **Approval needed** | Check Vercel env scoping before any push |

## Coverage impact (headline)
Eligible observations 22,319 → 3,782; firms 2,585 → 372; job/location combos 1,783 → 359; roles with a national range 99 → 65. Registered Nurse 1,372 → 43. Detail and overlap explanation: `COVERAGE_IMPACT.md`.

## Remaining verification
```
cd C:\Users\andyb\dev\sv-repair
npm test
npm run build
npx vite --port 5179     # then check 360/390/768/1440 widths
python scripts/export_signal_snapshot.py   # candidate only -> out/candidate/ ; --publish writes served file (needs approval)
```

## Rollback
Code and data are paired at 2.0.0. Reverting the branch restores 1.2.0 code with 1.2.0 data (the known-flawed population). Safe rollback = keep 2.0.0 code; with no 2.0.0 snapshot the site shows "unavailable" instead of invalid figures.

## New runtime/services
None added. Analytics, if enabled, would post to whichever endpoint is configured (cost depends on the tool chosen).
