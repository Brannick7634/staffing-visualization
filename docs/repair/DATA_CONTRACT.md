# Staffing Signal data contract: calculation version signal-agg-2.0.0

This is for the UI work (`src/**`) and for release review. The data/API side is implemented. Numbers are in `COVERAGE_IMPACT.md`.

## Version pairing (important for release)

- `api/_lib/signal/productionAdapter.js` accepts **only** `signal-agg-2.0.0` snapshots and `signal-month-2.0.0` months.
- The committed `api/_lib/signal/data/signal-snapshot.json` is still `signal-agg-1.2.0`. Until a 2.0.0 snapshot is published, this branch answers 503 `feed_unavailable`, and the UI shows its existing unavailable/retry state. This is deliberate: old figures are never shown under the new methodology text, and a rollback of data alone cannot bring them back.
- Committed `data/monthly/2026-08.json` and `2026-09.json` (1.0.0) are skipped, so `trend` is null. `data/report/2026-09.json` returns 503 `report_method_superseded`, and `scripts/monthly_report_email.mjs` refuses to send it.

## New fields the UI may use

| Where | Field | Meaning |
|---|---|---|
| pay response scope (`result`, `fallback`) | `observationCount` | Usable advertised-rate observations behind that published cell (integer, or null if unknown). Shown only where `firmCount` is shown. |
| pay response `national` | `observationCount` | Same, for the nationwide entry in the pay response. The snapshot `nationalPay` list is unchanged. |
| snapshot `snapshot` | `sourceRefreshedAt` | ISO time the source pay table was rebuilt (UTC). |
| snapshot `snapshot` | `observationWindow` | `{ firstPostingDate, lastPostingDate }` of the observations used, or null. |
| report model (`buildClientReportModel`) | `figures.observationCount` | Carried into `reportView().firmLine`: "from 23 advertised rates across 5 staffing firms". |

These dates stay separate:
- `lastSuccessfulRefresh` / `exactDate`: when the snapshot was exported.
- `sourceRefreshedAt`: when the source data was rebuilt.
- `observationWindow`: the posting dates actually used.

Do not present an export date as a collection date. Missing or withheld values are null, never 0.

Privacy: `observationCount` is an aggregate of a cell that already passed the 3-firm / 50% rule. It reveals no firm identity or share. The service test allowlist was extended for `observationCount` and `observationWindow`, citing brief section 2. Firm shares and identities are still never emitted.

## Text already aligned (shared, so screen/print/PDF match)

These now describe "pay originally advertised per hour, contract/temporary postings, verified staffing firms":
- `shared/signal/clientReport.js`: `DISCLAIMER` and `METHOD_NOTE`
- the email caveat in `api/_lib/clientReportEmail.js`
- the monthly report notes in `api/_lib/signal/report.js`
- the snapshot `note`

**For the UI agent:** `src/preview/pages/MethodologyPage.jsx` still describes salaries converted at 2,080 h/yr. It needs the 2.0.0 rules: hourly-advertised only; contract/temporary labels only; positively verified staffing firms; the privacy rule unchanged; and passing the rule is not a confidence claim. Also update `Footer.jsx`, `MonthlySignal.jsx`, `SectorModule.jsx` and `Calculator.jsx`, which say "Staffing-firm postings only". The monthly trend will be absent until two 2.0.0 months exist, so the "no comparable history" state applies.

Do not activate the proposed evidence labels (`proposedEvidenceStandard` in the candidate snapshot) without Andy's approval.

## Source fields used (real columns only)

The list is in `scripts/signal_population.py` (`SOURCE_FIELDS`):
- `pay_observations`: `posted_as`, `pay_from`, `pay_group`, `per_diem` and `plausible`.
- `canonical_jobs.raw_json`: `$.salary_currency`, `$.job_employment_types`, `$.employment_statuses` and `$.employer_type`.
- `canonical_jobs`: `employment_type` and `duplicate_status`.
- `company_identity`: `staffing_segment`, `legal_company_name` and `normalized_domain`.
- `search_targets.search_error`: the flags.

## Producing and releasing data

```
python scripts/export_signal_snapshot.py                 # candidate -> out/candidate/signal-snapshot.json
python scripts/export_signal_monthly.py --month 2026-10  # candidate -> out/candidate/monthly/
python scripts/coverage_impact.py                        # -> out/candidate/coverage_impact.json
python scripts/export_signal_snapshot.py --publish       # RELEASE STEP (needs approval): served file
python scripts/export_signal_monthly.py --previous-month --out-dir api/_lib/signal/data/monthly   # RELEASE STEP
```

The scheduled `weekly-signal-snapshot.ps1` / `monthly-signal-report.ps1` run in the master checkout. After this branch merges, they write candidates only. Each needs `--publish` (or `--out-dir`) added once Andy approves. That is a deliberate approval point, and it was not changed here.
