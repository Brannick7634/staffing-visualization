# Benchmark coverage impact: signal-agg-1.2.0 → 2.0.0 (CANDIDATE)

Status: **implemented and tested on local fixtures; candidate built from the live pipeline (read-only). Not published. Incomplete for production release** until Andy approves the population rules below and a 2.0.0 snapshot is published with `--publish`.

Generated 2026-10-16 by `python scripts/coverage_impact.py`. The full numbers are in `out/candidate/coverage_impact.json` (gitignored). The source was `pay_benchmarks.sqlite`, built 2026-10-12 00:45 UTC: 54,110 pay observations from postings seen in the previous 90 days. "Before" and "after" use the same role mapping, cell code and privacy rule. Only the population differs.

## Headline

| | Before (1.2.0, as published) | After (2.0.0 candidate) |
|---|---:|---:|
| Eligible observations (role-mapped, used in cells) | 22,319 | 3,782 |
| Contributing firms | 2,585 (company ids) | 372 (normalized firm names) |
| Publishable job/location combinations (state + city cells) | 1,783 | 359 |
| …of which city cells | 744 | 114 |
| Roles with a nationwide range | 99 | 65 |
| Published cells with fewer than 10 observations | 1,194 | 307 |
| Published cells with exactly 3 observations | 330 | 94 |
| Published cells from fewer than 5 firms (existing "directional guide" note) | 841 | 219 |

The "before" totals match the published snapshot: 1,882 cells, and 49,566 admitted observations before role mapping. About 83% of the usable observations are lost. Example nationwide cells, shown as observations / firms:

| Role | Before | After |
|---|---|---|
| Registered Nurse | 1,372 / 291 | 43 / 27 |
| Warehouse Associate | 1,135 / 394 | 77 / 51 |
| Forklift Operator | 451 / 187 | 9 / 6 |
| CNA | 450 / 118 | 9 / 8 |
| ICU RN, Packer, CDL-A | published | withheld (2 or fewer observations) |

## Audit findings reproduced against the current code

1. **Annual pay converted to hourly was admitted.** Of the 49,566 observations the 1.2.0 export admitted, 20,043 were posted annually, 317 monthly, 138 weekly and 27 daily. All of them became hourly figures through `hourly_mid`. The cause is that `pay_benchmarks.py` converts every period and the exporter never checked `posted_as`.
2. **Companies counted as staffing firms unless excluded.** Under the new evidence rule, 10,296 of the admitted observations came from companies with no staffing evidence, and 4,731 came from companies with conflicting evidence. One example of conflicting evidence: JobsPipe labels most of the firm's postings "employer". The old filter also ignored the 819 companies flagged "Excluded: real Industry classification…", and it treated any `staffing_segment` value as staffing in pay_benchmarks, including Hospitals, Retail and Restaurants.
3. **Small samples passed the concentration check.** The rule is ≥3 firms and ≤50% from any one firm. A cell of three postings from three firms passes it. 330 published cells had exactly 3 observations, and 1,194 had fewer than 10. Pay cells did not record their observation count at all.
4. 30,206 admitted observations had **no contract/temporary evidence**. They were full-time only, mixed, missing or internship.

Publication rule checked and **unchanged**: `MIN_FIRMS = 3` and `MAX_SHARE = 0.5` with `<=` in `export_signal_snapshot.py`, and `PRIVACY_RULE = {minDistinctFirms: 3, maxFirmShare: 0.5}` in `api/_lib/signal/privacy.js`.

## Exclusions by reason

A record can fail several rules, and every failing reason is counted. That is why the columns add up to more than the 44,936 records held out. 12,964 records failed exactly one rule, 11,261 failed two, 12,706 failed three and 8,005 failed four or more. "Sole reason" counts records that failed only that one rule. Relaxing that rule alone would bring them back, subject to role mapping.

| Reason | Records failing it | Only reason |
|---|---:|---:|
| `no_contract_evidence` (full-time or part-time labels only) | 28,584 | 3,465 |
| `currency_not_stated` (JSearch salary fields have no currency) | 26,048 | 1,735 |
| `pay_period_annual` | 21,700 | 2,744 |
| `firm_unknown` (no staffing evidence) | 12,589 | 866 |
| `firm_conflicting` | 6,793 | 2,959 |
| `employment_type_missing` | 2,701 | 850 |
| `pay_period_weekly` | 2,362 | 0 |
| `travel_weekly_package` | 2,221 | 0 |
| `employment_type_mixed` (e.g. "Full-time and Contractor") | 1,397 | 146 |
| `internship` | 519 | 156 |
| `stipend_or_per_diem` | 404 | 5 |
| `pay_period_monthly` / `daily` | 335 / 30 | 0 |
| `implausible_pay` | 192 | 35 |
| `repost` | 40 | 3 |

By rule group, with overlap: pay 33,697; employment 33,201; firm 19,382; dedupe 40. 9,174 records pass every rule. Role mapping then drops 5,392 of them, leaving 3,782.

## Contested rules: what each costs (sensitivity only, NOT applied)

| If this rule alone were relaxed | Observations | Firms | Job/location combos | Nationwide roles |
|---|---:|---:|---:|---:|
| (as built) | 3,782 | 372 | 359 | 65 |
| Accept JSearch structured salaries as USD | 4,472 | 476 | 430 | 80 |
| Accept mixed employment labels | 3,872 | 396 | 367 | 70 |
| Accept firms with no staffing evidence | 4,125 | 486 | 397 | 74 |

None of these brings coverage close to the old level. Most of the loss comes from postings that are not hourly, not contract and not from verified firms, which is the population the brief excludes.

## Firm identity

5,418 company ids are verified staffing firms. They collapse to 5,305 normalized names (113 merges). That stops one firm under two names from counting as two contributors. Merging is the conservative direction, because it can only lower the distinct-firm count.

## Proposed evidence standard (NOT active, needs Andy's approval)

Publication eligibility stays exactly as it is. Separately, I propose a **minimum of 10 usable observations** before a figure is published. In the candidate, that would withhold 307 of the 424 publishable cells. As an alternative to withholding, show labels:

- **Broader evidence**: at least 10 firms and at least 30 observations
- **Moderate evidence**: at least 5 firms and at least 10 observations
- **Limited evidence**: passes the publication rule but falls below Moderate. This keeps the existing "directional guide" note.

These are plain counts. There are no confidence percentages, and no percentiles beyond the P25, median and P75 that the export already computes. They are recorded as `proposedEvidenceStandard` (status `proposed_not_active`) in the candidate snapshot. No code applies them.

## History

`pay_observations` is a rolling 90-day table that is rebuilt on every run, and company classifications reflect today. So the August and September 2026 archives (`signal-month-1.0.0`) are **not rebuilt**. The adapter now refuses them, the pay trend is withheld, and the 2026-09 monthly report returns 503 `report_method_superseded`. A candidate `out/candidate/monthly/2026-09.json` (signal-month-2.0.0) was generated to prove the pipeline. It only uses postings first seen by the end of September, but it still uses today's firm classifications. Publishing it is Andy's call. A trend resumes only after two consecutive 2.0.0 months exist.

## Gaps in the source (records held out, not guessed)

- **Currency:** JSearch sends no currency field. Only JobsPipe has `salary_currency`. Description-parsed pay counts as USD only because the extractor requires a "$".
- **Estimates:** no source field marks pay as estimated. JSearch structured salaries are assumed to come from the posting, but that cannot be verified.
- **Maintained approval list:** none exists. The `--staffing-cids` file used for the October fixture was a one-off and is no longer used.
- **`staffing_segment`:** it mixes staffing segments with industries copied from another field. Only clearly staffing values count as evidence: Healthcare Staffing, Light Industrial, IT Professional, Skilled Trades, Technical, Admin, professional, skilled and Executive Recruiting. Values like Construction, Manufacturing, Healthcare and IT do not count.
