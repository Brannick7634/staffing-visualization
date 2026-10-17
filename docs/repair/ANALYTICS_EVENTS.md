# Analytics events (repair brief §3)

Status: **ON by default (approved by Andy 2026-10-16)**, first-party and
cookie-free. Events go to our own collector at `/api/track` and are stored in
our existing Postgres. No third-party analytics service is used.

## Interface
`track(event, props, { dedupeKey })` in `src/preview/lib/track.js`.

- Allowed property keys: `roleKey, sectorKey, geographyLevel, coverage, access, variant, reason`.
- Values must be short machine identifiers (`[A-Za-z0-9_.-]{1,64}`, not a bare number). Anything else is dropped, so pay rates, names, emails, recipients, notes and tokens cannot pass even if a caller mistakenly passes them.
- Payload: `{ event, props, path }` where `path` is the pathname only (no query or hash, so confirm/reset tokens never leave).
- No cookies, storage, visitor ID or session ID. No returning-visitor measurement.
- Non-blocking: `navigator.sendBeacon`, else `fetch(..., keepalive, credentials:'omit', referrerPolicy:'no-referrer')`; errors swallowed.
- Success events (`ONCE_EVENTS`) are sent once per page load per dedupe key.

## Events
| Event | Meaning (and what it does NOT prove) |
|---|---|
| pay_check_started | Compare Client Pay submitted with a role selected |
| national_result_viewed / local_benchmark_requested | Result shown / local level requested |
| local_coverage_available / local_coverage_unavailable | Coverage outcome for the requested geography (coverage-failure rate numerator) |
| gate_shown / report_gate_shown | Signup/sign-in gate displayed |
| report_create_clicked | Create Client Pay Report chosen |
| signup_started | First submit attempt of the signup form |
| signup_failed | Server rejected signup (`reason`: account_exists, rate_limited, error) |
| signup_completed | Server confirmed account creation (simulated dev signups excluded). Once per page load |
| report_viewed | Personalized report rendered for a signed-in user. Once per role/geo per page load |
| sample_report_viewed | Public sample opened |
| report_print_requested | Print dialog opened. NOT proof of printing |
| report_download_started / report_download_failed | PDF handed to the browser / generation failed. NOT proof the file was saved |
| report_email_submitted / report_email_accepted / report_email_failed | Request sent / our server accepted it for sending / rejected. NOT inbox delivery (no provider confirmation is wired) |
| preferences_saved, market_report_opened, monthly_issue_opened, contact_clicked | As named |
Legacy constants `report_printed`, `report_downloaded`, `report_emailed` remain defined for test compatibility but are never emitted.

## Funnel (reported in the weekly email)
pay_check_started -> local_coverage_available | local_coverage_unavailable -> report_create_clicked -> report_gate_shown -> signup_completed -> report_viewed -> report_print_requested / report_download_started / report_email_accepted.
Coverage rate = available / (available + unavailable). No conversion-improvement claim until a baseline and a follow-up period both exist.
(Updated 2026-10-16: superseded.) A `page_view` event now exists and is counted per page opened, with no visitor ID, so it is not unique visitors. Property values are limited to known enum/taxonomy keys and paths to known routes (`shared/signal/analyticsRules.js`). The weekly email shows per-action ratios labelled as event ratios, not person-level conversion.

## What is collected and where
- Collector: `POST /api/track`, rewritten in vercel.json to `api/account.js?route=track` (no new function file; Hobby caps functions). Code: `api/_lib/analytics.js`.
- The server re-applies the allowlist and **rejects the whole event** on any unknown key, unknown/legacy event, unsafe value (emails, rates/numbers, free text, over 64 chars) or a path with query/hash. Body capped at 2 KB. Always answers fast (204/400); database errors never reach the page.
- Stored: table `analytics_events(id, ts, event, props jsonb, path)`, created automatically if missing. Nothing else: no IP, user agent, cookie, visitor or session ID. Request bodies, IPs and user agents are never logged.
- Retention: the weekly job deletes rows older than **13 months**.

## Weekly report
- `GET /api/analytics/weekly` (rewritten to `api/account.js?route=analytics-weekly`), called by Vercel Cron Mondays 12:00 UTC (`0 12 * * 1`).
- Requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically when CRON_SECRET is set); otherwise 401 and nothing is sent.
- Counts last 7 days vs prior 7 days: comparisons started, coverage available/unavailable and rate, gate shown, signups completed, reports viewed, download started, print requested, email accepted/failed, with funnel denominators. With no rows it says there is no data. Emailed to andy@thestaffingsignal.com via the existing Resend sender.
- Vercel Hobby plan: crons run at most once per day and timing is only accurate to the hour (may fire any time in 12:00-12:59 UTC); the Hobby limit on number of cron jobs is small, and this is the second one (the first is the daily dashboard-metrics recompute). Check the current Vercel limits if more are added.

## Configuration
- **CRON_SECRET must be set** in Vercel (Production), at least 16 random characters. Without it the weekly job refuses (401).
- DATABASE_URL, RESEND_API_KEY and SIGNAL_FROM_EMAIL already exist; no change. If DATABASE_URL is missing, the collector silently drops events (204).
- Kill switch: set build-time `VITE_ANALYTICS_ENABLED=false` and redeploy. `VITE_ANALYTICS_ENDPOINT` optionally overrides `/api/track`. Development builds send nothing unless an endpoint is set.

## Privacy page sentence
"We count anonymous page actions (for example, that a pay comparison was run or a report was opened) on our own server, with no cookies, no visitor ID, and no IP address or rate stored; these counts are deleted after 13 months."
