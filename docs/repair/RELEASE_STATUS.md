# Staffing Signal — current release status (2026-10-16, audit follow-up)

Production: master **933e52e**, serving `signal-agg-2.0.0` (generated 2026-10-16T20:43:16Z, source rebuilt 2026-10-12 00:45:09).
This work: branch **`repair/audit-followup-2026-10-16`** (worktree `C:\Users\andyb\dev\sv-repair`), cut from 933e52e.
**Not pushed, not merged, not deployed.** No production data, accounts, events or emails were created.

Earlier notes (`HANDBACK.md`) are kept as a dated historical record.

## What changed

| Audit item | Change | Files |
|---|---|---|
| R1 provider majority | **No code change** — awaiting Andy's decision. Read-only impact below. | — |
| R2 dropped events | Stops only when `sendBeacon` returns `true`; `false` or a throw falls through to one keepalive `fetch`. Errors swallowed, no retry loop. | `src/preview/lib/track.js` |
| R2 storage proof | Collector sets `X-Analytics-Stored: 1/0` (no visitor data) so a 204 isn't mistaken for storage; one warning per instance when `DATABASE_URL` is missing. | `api/_lib/analytics.js` |
| R3 "funnel" | Renamed to "Action ratios … NOT unique-person conversion rates". Downloads, prints and emails are shown separately per report viewed; the email notes ratios can exceed 100%. | `api/_lib/analytics.js` |
| R4 privacy | Every property accepts only known values (role/sector taxonomy keys, coverage/access enums, `a`/`b`, a fixed list of error codes). Paths collapse to known routes, else `/other`. Shared by browser and server. | `shared/signal/analyticsRules.js`, `track.js`, `analytics.js` |
| R4 cost | Per-instance cap of 300 events/minute → 429, no DB work. Best effort: each serverless instance counts separately. Vercel's own protections were not verified. | `api/_lib/analytics.js` |
| R5 freshness | Homepage, trust strip, result card, methodology page and the report/PDF now show three separate facts: "Benchmarks recalculated", "Source pay table rebuilt", "Postings dated X to Y". The server refuses a snapshot whose source rebuild is missing, later than the export, or older than 15 days, checked separately from the 10-day export age. | `shared/signal/freshness.js`, `Hero.jsx`, `TrustStrip.jsx`, `ResultCard.jsx`, `MethodologyPage.jsx`, `ClientReportPage.jsx`, `clientReport.js`, `clientReportPdf.js`, `productionAdapter.js`, `dev/signal/vitePlugin.js` |
| 7 availability | The snapshot API now lists, per role, the states and cities that have a published benchmark (existence only, no figures). The calculator shows it before Compare: "No Texas benchmark for Forklift Operator yet; you'll see the nationwide figure instead." Publication rules are unchanged. | `api/_lib/signal/service.js`, `shared/signal/availability.js`, `Calculator.jsx` |

Audited roles against the served snapshot (a test enforces these): forklift operator 2 states (OH, PA) / 0 cities; general laborer 1 (VA) / 0; warehouse associate 10 / 1 (New York); registered nurse 4 (CA, MD, NJ, NY) / 1 (New York).

## R1 — read-only impact (decision needed)

Current rule: a company counts as a staffing provider only if **agency or broker alone** is its single largest JobsPipe category. Alternative tested: **agency + broker combined** form a majority (more than half) of its classified postings.

- Synthetic 4 agency / 4 broker / 5 employer: current → not verified; combined → verified.
- Real data (local `jsearch.sqlite`, read-only): 22 companies move from "conflicting" to "verified". Another 60 move from "conflicting" to "unknown", which is withheld either way.
- Eligible pay observations go from 4,472 to 4,482 (+10). Publishable pay cells go from 510 to 512 (both are Payroll Specialist state cells).
- Seven roles gain 1–3 observations. None of the four audited roles gains a state or city.

Explicit negative flags and posting-level employer exclusions are unchanged under either rule. If the combined rule is approved, fixtures for ties, unknown votes, negative flags and posting-level employers come with the code change. Publishing the new aggregates also needs approval.

## Verified

- `npm test`: **543/543 pass**. That is 530 before plus 13 new: transport fallback (beacon true/false/throws, no beacon, fetch rejects/throws), plausible-string privacy (`Andy`, token shapes, slugs), route paths, the stored header, the rate cap, the 300% case, source-age vs export-age boundaries, and availability against the bundled snapshot. Four old tests used values the strict filter now rejects (e.g. `access: 'free'`), so they were updated.
- `npm run build`: passes.
- Local browser (Vite dev server, real committed snapshot, desktop + 375px phone):
  - The three dates show on the homepage and result card.
  - The availability note is correct for Texas, Ohio, and California/Los Angeles.
  - A Registered Nurse / Los Angeles comparison falls back to California with the 3-firm limited-evidence warning.
  - No sideways scroll on the phone layout.

## Not tested (needs a deployed environment or Andy)

- Signup, sign-in, the gated personalized report, PDF layout, print, and email to the approved test address (andybkohler@gmail.com). These need the real API, database and mail provider. That environment isn't local, and I can't create accounts on non-local sites. A preview deploy shares production's database and mail settings, so these steps are for Andy to run on the preview URL.
- An analytics event actually landing in Postgres. Needs an authorized read of `analytics_events` after one preview visit. Check the `X-Analytics-Stored: 1` header in the browser's network tab, then confirm the row.
- Custom-domain deployment and the LinkedIn preview card.
- The monthly report endpoint returns 503 in local dev (no monthly report is served locally). It's unrelated to these changes.

## Runtime implications

- The snapshot response grows by one small `localAvailability` object (51 roles).
- Analytics: events with any unknown value are now rejected (400) instead of stored. Expect slightly fewer stored events. There are no new services, scheduled jobs or costs.
- Snapshot freshness: if the Sunday source rebuild fails twice in a row (more than 15 days), the site shows "unavailable" even if the weekly export ran. That's intended.

## Rollback

Production is untouched. If this branch is merged and must be undone, revert its commits on master (`git revert <commits>`) and redeploy. That restores 933e52e behaviour, which still serves the 2.0.0 snapshot. Never restore a 1.x snapshot: the adapter refuses it by design.
