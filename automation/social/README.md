# Daily LinkedIn market posts — deployment handoff

Prepared October 5, 2026 for Andy Kohler. Status: draft implementation; NOT deployed or posting.

## Intended outcome

Automatically select one eligible market observation per day and publish to both Andy's personal LinkedIn profile and The Staffing Signal company page. Keep posts short, descriptive, and directed to free website access. No HeyGen, videos, new Airtable base, or daily writing task. Graphics are part of the intended finished product but are NOT implemented in this draft.

## Saved work

Repository: Brannick7634/staffing-visualization
Branch: feature/daily-linkedin-market-posts-2026-10-05

- automation/social/daily_social.py: text-only candidate selection, captions, preview, dual-destination API adapter, private SQLite publication ledger.
- automation/social/test_daily_social.py: 38 offline tests using synthetic fixtures and mocked network responses.

All 38 tests passed locally during this task against publisher blob 629e0f150ff2a5715d5f6056a62e65ec5caa068b. That is not a live LinkedIn test or an independent validation of the production collection. No posts were sent. The branch was not merged or deployed.

## Source and behavior

Read the existing monthly aggregate files at api/_lib/signal/data/monthly/YYYY-MM.json. Do not feed individual employer/job data into social publishing. Choose a national light-industrial or healthcare pay spotlight, a validated national pay movement, or an explicitly approved state posting-share observation. Use fixed templates, actual geography/reporting periods, and separate tracking parameters for personal/company posts. Tracking parameters alone do not establish working website analytics or signup attribution.

Default execution is preview-only. Live sending requires --live plus five explicit approval gates and credentials for every selected destination. A gate is an operator attestation, not a permission audit. The current adapter attempts the two accounts sequentially; there is no installed daily scheduler.

Implemented checks include verified five-firm / maximum-50%-contribution rules, at least 30 observations for national pay cells, comparable method definitions, restricted role lists, and duplicate-story handling. Change posts require checks in both months. Noise thresholds are not statistical confidence or proof of representative wage change. State promotion is off unless explicitly allowed; local pay remains excluded.

Reserve each destination before sending. Timeouts, missing receipts, or interrupted sends require reconciliation; do not blindly retry or clear the ledger. One account's success must not be repeated because the other failed. Use one persistent host or replace the ledger with an appropriately locked shared database before scaling.

## Data hold discovered

The fetched August 2026 archive identifies its period as August 1–31 and marks it reliable, while collectionStart is August 3. That is conflicting coverage metadata, not proof that every August observation is wrong. Establish whether August 1–2 were backfilled and whether collection coverage and samples support a comparison. Do not change dates or flags simply to pass validation.

The draft holds August-versus-September change stories. September-only pay spotlights can remain candidates when their own checks pass. No complete production-data run was performed here.

## Must finish before live activation

1. Verify the exact personal profile and company page, OAuth authorization, organization publishing role, current API version, and credential renewal. Store tokens in the existing secret manager, never in chat, Git, or logs. Member/page credentials were NOT inspected or connected.
2. Independently review staffing-only classification, duplicates, pay normalization, comparable collection coverage, aggregation rights, and any needed compliance approval. Current method flags alone are not proof.
3. Fix the draft freshness policy: it currently requires both archive export/source dates within 10 days. Immutable historical archives will age out. Use an evidence-based policy that distinguishes archive validity from current collection freshness. Do not relabel old data as fresh. Add tests requiring source coverage of the full reporting period and consistent source/export chronology.
4. Implement the fixed branded graphic renderer and image-upload path. Neither exists yet. Approve the final template and initial real-data posts before unattended publication. Do not use generative image models to draw authoritative numeric charts.
5. Install the daily schedule on the existing approved n8n/worker setup with America/New_York timezone and persistent private state outside the repository. No posting time was selected. Inspect the host first; do not assume access, paths, or execution-node availability. Do not expose an unauthenticated publishing webhook.
6. Connect exception alerts and source synchronization. Nonzero exit codes are implemented, notifications are not. Handle token expiry and API-version lifecycle. Verify the destination/signup flow and tracking persistence.
7. Execute approved end-to-end tests on both destinations, retain real publication receipts, and confirm reruns do not duplicate posts. Only then enable the daily schedule. A day without eligible evidence should be skipped and logged.

## Commands

Requires Python 3.10+ and America/New_York timezone data. Standard library only. From the repository root:

```sh
python3 -m unittest discover -s automation/social -p 'test_*.py' -v
python3 automation/social/daily_social.py --repo-root "$PWD" --state-dir /var/lib/staffing-signal-social --target both
```

The second command is preview-only and requires real monthly files from the repository. Never substitute synthetic test data. Live activation is intentionally omitted until the checks above are completed.

Configuration names:

```text
SOCIAL_LIVE_ENABLED=0
SOCIAL_TEMPLATE_APPROVED=0
SOCIAL_TARGETS_VERIFIED=0
SOCIAL_LANDING_PAGE_VERIFIED=0
SOCIAL_SOURCE_APPROVED=0
SOCIAL_PUBLIC_STATE_CODES=
LINKEDIN_API_VERSION=
LINKEDIN_PERSONAL_OWNER_URN=
LINKEDIN_PERSONAL_ACCESS_TOKEN=
LINKEDIN_COMPANY_OWNER_URN=
LINKEDIN_COMPANY_ACCESS_TOKEN=
```

## Handoff instruction

Continue this branch rather than rebuilding HeyGen or creating another content system. Resolve the listed issues, add graphic generation, and connect the existing publishing infrastructure. Return exactly what was tested, which identities were verified, whether the schedule is active, and any remaining holds. Do not describe a draft, a successful mock test, or a configured variable as a live integration.
