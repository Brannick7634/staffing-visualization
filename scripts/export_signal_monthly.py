"""Monthly archive of Staffing Signal aggregates (one calendar month).

Writes api/_lib/signal/data/monthly/YYYY-MM.json from the same READ-ONLY
pipeline databases, role mapping, firm identity, quantile method and privacy
rule as scripts/export_signal_snapshot.py (imported, not copied). Only the time
window differs: everything is scoped to postings whose
COALESCE(posting_date, first_seen_date) falls inside the month.

  * Pay cells (role x nationwide/state/city): pay_observations of that month.
  * Demand counts: new staffing-firm postings of that month, per state, per
    city, per role (nationwide and per state / city). Reposts and repeat
    fingerprints dropped, as in the weekly snapshot.
  * Privacy rule on every cell: >= 5 distinct firms, no firm > 50%. Failing
    cells are omitted; only their count is kept under "withheld".

A month is built only when it can be built RELIABLY:
  * it has ended (the month's last day is before --today), and
  * collection had started by day 3 of the month (postings dated earlier in
    the month are still captured through posting_date), and
  * the pay database was rebuilt after the month ended.
Otherwise the script refuses (exit 3) and says why. July 2026 fails: the
pipeline's first collection was 2026-08-03, so July only holds postings that
were still live in August.

Usage:
  python scripts/export_signal_monthly.py --month 2026-09 [--pipeline DIR] [--out-dir DIR] [--dry-run]
  python scripts/export_signal_monthly.py --previous-month      # month before --today (scheduled use)
  python scripts/export_signal_monthly.py --backfill            # every month that passes the rule
Exit codes: 0 written (or already present with --skip-existing), 2 no data, 3 not reliable.
"""
import argparse
import calendar
import datetime as dt
import json
import os
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_signal_snapshot as base  # noqa: E402

MONTH_CALC_VERSION = "signal-month-1.0.0"
FORMAT = "staffing-signal-monthly-aggregates"
SCHEMA_VERSION = 1
COLLECTION_GRACE_DAYS = 2  # collection must start on or before day 1 + 2
DEFAULT_OUT_DIR = base.REPO / "api" / "_lib" / "signal" / "data" / "monthly"


def month_bounds(month):
    y, m = (int(x) for x in month.split("-"))
    start = dt.date(y, m, 1)
    end = dt.date(y, m, calendar.monthrange(y, m)[1])
    return start, end


def previous_month(day):
    first = day.replace(day=1)
    return (first - dt.timedelta(days=1)).strftime("%Y-%m")


def reliability(month, today, collection_start, source_built):
    """Return (reliable, reason). Pure: unit-tested."""
    start, end = month_bounds(month)
    if end >= today:
        return False, f"{month} has not ended yet (today {today.isoformat()})"
    if collection_start is None:
        return False, "no collection dates in the pipeline"
    if collection_start > start + dt.timedelta(days=COLLECTION_GRACE_DAYS):
        return False, (f"collection began {collection_start.isoformat()}, after {month} started; the month would "
                       "only hold postings that were still live later (biased sample)")
    if source_built is not None and source_built <= end:
        return False, f"pay database built {source_built.isoformat()}, before {month} ended"
    return True, "complete month, collection running throughout"


def counts_rows(groups, make_row):
    rows, withheld = [], 0
    for key, firm_ids in sorted(groups.items()):
        c = base.checks(firm_ids)
        if not base.passes(c):
            withheld += 1
            continue
        rows.append(make_row(key, len(firm_ids), c))
    return rows, withheld


def build_month(pipeline, month, today, staffing_cids=None):
    db = Path(pipeline) / "db"
    sys.path.insert(0, str(Path(pipeline) / "src"))
    import taxonomy as tx  # pipeline's own title classifier (read-only use)

    j = sqlite3.connect(f"file:{(db / 'jsearch.sqlite').as_posix()}?mode=ro", uri=True, timeout=120)
    p = sqlite3.connect(f"file:{(db / 'pay_benchmarks.sqlite').as_posix()}?mode=ro", uri=True, timeout=120)
    built_at = p.execute("SELECT built_at FROM meta").fetchone()[0]
    first = j.execute("SELECT min(substr(first_seen_date,1,10)) FROM canonical_jobs").fetchone()[0]
    collection_start = dt.date.fromisoformat(first) if first else None
    ok, why = reliability(month, today, collection_start, dt.date.fromisoformat(built_at[:10]))
    if not ok:
        return None, why

    start, end = month_bounds(month)
    lo, hi = start.isoformat(), end.isoformat()
    non_staffing = {r[0] for r in j.execute(
        "SELECT shared_company_id FROM search_targets WHERE COALESCE(search_error,'') LIKE 'non-staffing employer%'")}
    allow = set(staffing_cids) if staffing_cids is not None else None

    def staffing(cid):
        if cid is None:
            return False
        return cid in allow if allow is not None else cid not in non_staffing

    job = {}
    for jid, cid, detail, rf, fs in j.execute(
            "SELECT canonical_job_id, shared_company_id, role_detail, role_family, substr(first_seen_date,1,10) "
            "FROM canonical_jobs"):
        job[jid] = (cid, detail if (rf and "Nurse" in rf) else None, fs)

    # ---- pay (same filters as the weekly snapshot, month window)
    groups = defaultdict(list)
    pay_obs = 0
    for jid, occ, title, st, city, mid, pg, pdate in p.execute(
            "SELECT canonical_job_id, occupation, job_title, state, city, hourly_mid, pay_group, "
            "substr(posting_date,1,10) FROM pay_observations WHERE plausible AND hourly_mid IS NOT NULL"):
        cid, detail, fs = job.get(jid, (None, None, None))
        d = pdate or fs
        if not d or d < lo or d > hi or pg == base.TRAVEL or not staffing(cid):
            continue
        pay_obs += 1
        role = base.role_for(occ, detail, title)
        if not role:
            continue
        groups[(role, "nationwide", "", "")].append((mid, cid))
        sc = base.state_code(st)
        if sc:
            groups[(role, "state", sc, "")].append((mid, cid))
            ck = base.city_key(city, sc)
            if ck:
                groups[(role, "city", sc, ck)].append((mid, cid))

    pay, withheld_pay, role_status = [], Counter(), {}
    for (role, level, sc, ck), rows in sorted(groups.items()):
        c = base.checks([f for _, f in rows])
        if not base.passes(c) or len(rows) < base.MIN_FIRMS:
            withheld_pay[level] += 1
            if level == "nationwide":
                role_status[role] = "withheld"
            continue
        p25, typ, p75 = base.pay_figures([v for v, _ in rows])
        pay.append({"roleKey": role, "level": level, "state": sc or None, "city": ck or None, "n": len(rows),
                    "p25Cents": p25, "typicalCents": typ, "p75Cents": p75, "checks": c})
        if level == "nationwide":
            role_status[role] = "publishable"

    # ---- demand (new postings dated in the month)
    seen_fp = set()
    st_g, city_g, role_g = defaultdict(list), defaultdict(list), defaultdict(list)
    total, firms = 0, set()
    occ_cache = {}
    for title, st, city, cid, fp, detail, rf, d in j.execute(
            "SELECT job_title, state, city, shared_company_id, fingerprint_hash, role_detail, role_family, "
            "substr(COALESCE(posting_date, first_seen_date), 1, 10) AS d FROM canonical_jobs "
            "WHERE COALESCE(duplicate_status,'new') <> 'repost' AND d >= ? AND d <= ? "
            "AND (country IS NULL OR upper(country) IN ('US','USA','UNITED STATES'))", (lo, hi)):
        if not staffing(cid):
            continue
        if fp:
            if fp in seen_fp:
                continue
            seen_fp.add(fp)
        total += 1
        firms.add(cid)
        if title not in occ_cache:
            o = tx.classify_occupation(title or "")
            occ_cache[title] = o[1] if o and o[1] else None
        role = base.role_for(occ_cache[title], detail if (rf and "Nurse" in rf) else None, title)
        sc = base.state_code(st)
        ck = base.city_key(city, sc) if sc else None
        if role:
            role_g[(role, "nationwide", "", "")].append(cid)
        if sc:
            st_g[sc].append(cid)
            if role:
                role_g[(role, "state", sc, "")].append(cid)
            if ck:
                city_g[ck].append(cid)
                if role:
                    role_g[(role, "city", sc, ck)].append(cid)

    states, w_states = counts_rows(st_g, lambda k, n, c: {"code": k, "postings": n, "checks": c})
    cities, w_cities = counts_rows(city_g, lambda k, n, c: {"cityKey": k, "postings": n, "checks": c})
    roles, w_roles = counts_rows(role_g, lambda k, n, c: {"roleKey": k[0], "level": k[1], "state": k[2] or None,
                                                          "city": k[3] or None, "postings": n, "checks": c})
    if not pay or not total:
        return None, "no publishable data for the month"
    return {
        "format": FORMAT, "schemaVersion": SCHEMA_VERSION, "calcVersion": MONTH_CALC_VERSION,
        "baseCalcVersion": base.CALC_VERSION, "month": month, "period": {"start": lo, "end": hi},
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourceBuiltAt": built_at, "collectionStart": first,
        "reliability": {"reliable": True, "reason": why},
        "method": {
            "window": "COALESCE(posting_date, first_seen_date) inside the calendar month",
            "privacyRule": {"minDistinctFirms": base.MIN_FIRMS, "maxFirmShare": base.MAX_SHARE, "shareOperator": "<=",
                            "appliesTo": "every pay cell and every demand count"},
            "payValue": "hourly_mid per posting; travel weekly packages excluded",
            "quantile": "statistics.quantiles(n=4, method='exclusive'); typical = median",
            "demand": "new staffing-firm postings; reposts and repeat fingerprints dropped",
        },
        "totals": {"postings": total, "firms": len(firms), "payObservations": pay_obs},
        "roleStatus": dict(sorted(role_status.items())),
        "pay": pay,
        "demand": {"states": states, "cities": cities, "roles": roles},
        "withheld": {"pay": dict(withheld_pay), "demandStates": w_states, "demandCities": w_cities,
                     "demandRoles": w_roles},
    }, why


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--month", help="YYYY-MM")
    g.add_argument("--previous-month", action="store_true")
    g.add_argument("--backfill", action="store_true")
    ap.add_argument("--pipeline", default=str(base.DEFAULT_PIPELINE))
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--today", help="YYYY-MM-DD (testing)")
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    if a.backfill:
        months, m = [], previous_month(today)
        for _ in range(12):
            months.append(m)
            m = previous_month(month_bounds(m)[0])
    else:
        months = [a.month or previous_month(today)]
    code = 0
    for month in sorted(months):
        out = Path(a.out_dir) / f"{month}.json"
        if a.skip_existing and out.exists():
            print(f"{month}: already archived, skipped")
            continue
        data, why = build_month(a.pipeline, month, today)
        if data is None:
            print(f"{month}: NOT BUILT - {why}")
            code = code or (3 if "no publishable" not in why else 2)
            continue
        nat = sum(1 for c in data["pay"] if c["level"] == "nationwide")
        print(f"{month}: postings {data['totals']['postings']:,}, firms {data['totals']['firms']:,}, "
              f"pay cells {len(data['pay'])} ({nat} national), demand states {len(data['demand']['states'])}, "
              f"cities {len(data['demand']['cities'])}, role rows {len(data['demand']['roles'])}")
        if not a.dry_run:
            write_json(out, data)
            print("  wrote", out.relative_to(base.REPO) if out.is_relative_to(base.REPO) else out)
    return 0 if a.backfill else code


if __name__ == "__main__":
    sys.exit(main())
