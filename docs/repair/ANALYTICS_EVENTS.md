# Analytics events (repair brief §3)

Status: **adapter implemented, delivery DISABLED. Live delivery is blocked**
until a destination is approved. No analytics tool was found in the repo
(no @vercel/analytics, GA, Plausible, Umami or PostHog in package.json,
index.html, src/ or api/ env names).

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

## Funnel (to build in the approved tool, not a new dashboard)
pay_check_started -> local_coverage_available | local_coverage_unavailable -> report_create_clicked -> report_gate_shown -> signup_completed -> report_viewed -> report_print_requested / report_download_started / report_email_accepted.
Denominators: each step / pay_check_started. Coverage-failure rate = local_coverage_unavailable / local_benchmark_requested.
No conversion-improvement claim until a baseline and a follow-up period both exist.

## Configuration needed to turn it on (Andy's approval required)
Build-time Vite variables (Vercel project env, Production scope only):
```
VITE_ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENDPOINT=https://<approved collector accepting POST JSON {event, props, path}>
```
The endpoint must be https and accept `application/json` beacons with no cookies. A free first-party option would be a small Vercel function writing to the existing Postgres (DATABASE_URL) - that is new storage and needs approval; Airtable must not be used as a collector. Verify with a production build pointed at a test endpoint and inspect the beacon bodies before enabling in Production.
