"""Export publishable Staffing Signal aggregates to a JSON snapshot.

Reads the JSearch/JobsPipe pipeline databases READ-ONLY and writes
api/_lib/signal/data/signal-snapshot.json, which the production adapter
(api/_lib/signal/productionAdapter.js) validates and serves.

Nothing here edits the shared pipeline: pay_benchmarks.py, taxonomy.py and the
databases are only read.

Method (CALC_VERSION below; bump it when any of this changes):
  * Staffing firms only. A company counts as a staffing firm unless Andy's
    2026-10-02 cleanup flagged it "non-staffing employer" in search_targets.
    Firm identity for the privacy rule = shared_company_id.
  * Pay: pay_benchmarks.sqlite pay_observations, plausible rows, travel weekly
    packages excluded. One value per posting = hourly_mid (midpoint of the
    advertised range, salaries converted at 2,080 h/yr by pay_benchmarks.py).
    P25 / P75 = Python statistics.quantiles(n=4, method='exclusive')
    (the (n+1)p rule, same as Excel QUARTILE.EXC); typical = median.
  * Demand: canonical_jobs, US, reposts and repeat fingerprints dropped.
    "New posting" date = COALESCE(posting_date, first_seen_date).
    City volume = new postings in the latest 45 days. Momentum = state's
    latest-45 / previous-45 ratio relative to the all-state ratio, minus 1.
  * Privacy rule on EVERY metric (pay cell, city row, momentum row — each
    comparison window — and posting families): >= 3 distinct firms and no
    firm > 50% of the metric's observations. Failing cells are omitted; only
    their count is recorded under "withheld". Fail closed: a cell with any
    missing input is withheld.

Usage:
  python scripts/export_signal_snapshot.py [--pipeline DIR] [--out FILE] [--dry-run]
Exit codes: 0 written, 2 refused (stale source / reproduction drift / no data).
"""
import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import statistics
import sys
import tempfile
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

CALC_VERSION = "signal-agg-1.2.0"  # 1.2.0 (2026-10-06): privacy minimum 5 -> 3 firms. 1.1.0 (2026-10-04): expanded role mapping
SCHEMA_VERSION = 1
FORMAT = "staffing-signal-aggregate-snapshot"
MIN_FIRMS = 3
MAX_SHARE = 0.5
WINDOW_DAYS = 45
MAX_SOURCE_AGE_DAYS = 10
CITY_ROWS_CAP = 300
TRAVEL = "Travel weekly package"

REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "api" / "_lib" / "signal" / "data" / "signal-snapshot.json"
DEFAULT_PIPELINE = Path(os.path.expanduser("~")) / (
    "OneDrive/Desktop/Email Sequnce Folder/MasterLeadsList/Airtable Set up/Tomorrow Land Set up/"
    "Claude Project/Updated Claude Docs/Workstation Docs/jsearch-pipeline-v2-remediated")

# --------------------------------------------------------------- role mapping
# Role keys = shared/signal/taxonomy.js. A posting maps to AT MOST ONE role;
# the first rule that matches wins, in this precedence:
#   1. RN occupation: the pipeline's nurse specialty (OCC_ROLES). A General RN
#      posting whose title names a specialty the pipeline does not track
#      (Telemetry, PACU, Cath Lab, Oncology, Case Manager) goes to that
#      specialty (RN_TITLE_SPECIALTIES); an LPN / NP / CRNA / CNA title filed
#      under RN goes to that role (NOT_RN); otherwise Registered Nurse.
#   2. Exact occupation roles (OCC_ROLES) - these reproduce the October fixture.
#   3. Clinical titles (CLINICAL_TITLE_ROLES; CLINICAL_EXCLUDE words).
#   4. Trade / industrial / hospitality titles (TITLE_ROLES; EXCLUDE words).
#   5. Office and IT titles (OFFICE_TITLE_ROLES; LEAD_EXCLUDE words).
#   6. Clean pipeline occupations (OCC_FALLBACK) for anything still unmapped.
# Only roles whose nationwide cell passed the privacy rule with >= 20 pay
# observations in the 2026-10-04 analysis are mapped. Candidates that failed
# (Travel Nurse and L&D Nurse: one firm > 50%; NICU / School / Dialysis Nurse, Dentist,
# Flagger, Material Handler, Dishwasher...) are deliberately not mapped.
RN = "Registered Nurse (RN)"
OCC_ROLES = {
    ("Warehouse Associate", None): "warehouse-associate",
    ("Forklift Operator", None): "forklift-operator",
    ("Software Engineer / Developer", None): "software-engineer",
    (RN, "General"): "registered-nurse",
    (RN, "ICU / Critical Care"): "icu-registered-nurse",
    (RN, "OR / Surgical"): "or-nurse",
    (RN, "ER / Emergency"): "er-nurse",
    (RN, "Med-Surg"): "med-surg-nurse",
    (RN, "Telemetry / PCU"): "telemetry-nurse",
    (RN, "Home Health / Hospice"): "home-health-nurse",
    (RN, "Long-Term Care"): "long-term-care-nurse",
}
RN_TITLE_SPECIALTIES = [
    ("telemetry-nurse", r"telemetry|\btele\b|step.?down|\bpcu\b|progressive care"),
    ("pacu-nurse", r"\bpacu\b|post.?anesthesia"),
    ("cath-lab-nurse", r"cath(eterization)? lab|\bcvl\b|interventional"),
    ("oncology-nurse", r"oncology|chemo|infusion"),
    ("nurse-case-manager", r"case manag|utilization review|care manag"),
]
CLINICAL_EXCLUDE = re.compile(r"manager|director|supervisor|sales|recruit|educator|instructor|professor|"
                              r"\bvp\b|vice president|chief|head of|account", re.I)
CLINICAL_TITLE_ROLES = [
    ("crna", r"\bcrna\b|nurse anesthetist"),
    ("nurse-practitioner", r"nurse practitioner|\b(a?np|aprn|fnp|pmhnp|agnp)\b"),
    ("physician-assistant", r"physician assistant|\bpa-c\b"),
    ("physician", r"\bphysician\b|hospitalist|psychiatrist|anesthesiologist"),
    ("lpn-lvn", r"\blpn\b|\blvn\b|licensed (practical|vocational)"),
    ("cna", r"\bcna\b|nurs(e|ing) (aide|assistant)|patient care (tech|assistant)|\bpct\b"),
    ("medical-assistant", r"medical assistant|\bcma\b"),
    ("phlebotomist", r"phlebotom"),
    ("ct-technologist", r"\bct (tech|technologist|scan)|cat scan|computed tomography"),
    ("mri-technologist", r"\bmri\b"),
    ("ultrasound-technologist", r"ultrasound|sonograph"),
    ("radiologic-technologist", r"radiolog(ic|y) (tech|technologist|technician)|rad tech|x.?ray tech|radiographer"),
    ("respiratory-therapist", r"respiratory therap|\brrt\b"),
    ("physical-therapist-assistant", r"physical therap\w* assist|\bpta\b"),
    ("physical-therapist", r"physical therap|\bdpt\b"),
    ("occupational-therapy-assistant", r"occupational therap\w* assist|\bcota\b"),
    ("occupational-therapist", r"occupational therap"),
    ("speech-language-pathologist", r"speech.?language|speech therap|\bslp\b"),
    ("surgical-technologist", r"surgical tech|scrub tech|\bcst\b"),
    ("sterile-processing-tech", r"sterile process|central (sterile|service)"),
    ("pharmacy-technician", r"pharmacy tech|pharm tech|\bcpht\b"),
    ("pharmacist", r"pharmacist|pharmd"),
    ("dental-hygienist", r"hygienist"),
    ("medical-lab-technologist", r"medical (lab(oratory)? )?(technologist|technician|scientist)|\bmls\b|\bmlt\b|clinical lab"),
    ("school-psychologist", r"psychologist"),
    ("bcba", r"\bbcba\b|behavior analyst"),
    ("behavior-technician", r"\brbt\b|behavior(al)? tech|aba therapist"),
    ("social-worker", r"social worker|\blcsw\b|\blmsw\b"),
    ("mental-health-therapist", r"counselor|\blpc\b|\blmhc\b|\blmft\b|(mental|behavioral) health (therapist|clinician)"),
    ("medical-biller-coder", r"medical (coder|coding|billing|biller)|\bcpc\b|coding specialist"),
]
EXCLUDE = re.compile(r"engineer|manager|director|supervisor|sales|recruit|nurse|software|estimator|designer|coordinator", re.I)
TITLE_ROLES = [
    ("banquet-staff", r"banquet|catering|event staff"),
    ("server", r"(?<!sql )(?<!windows )\bserver\b|waiter|waitress|bartend"),
    ("line-cook", r"\bcook\b|line cook|prep cook|\bchef\b"),
    ("housekeeper", r"housekeep|room attendant"),
    ("construction-superintendent", r"superintendent"),
    ("diesel-mechanic", r"diesel|heavy (duty|equipment) (mechanic|tech)|fleet mechanic"),
    ("industrial-mechanic", r"industrial (maintenance )?mechanic|millwright|machine repair"),
    ("hvac-technician", r"\bhvac\b|refrigeration tech"),
    ("plumber", r"\bplumber\b|\bplumbing\b"),
    ("electrician", r"electrician"),
    ("welder", r"\bwelder|\bwelding\b|fabricator"),
    ("maintenance-technician", r"maintenance tech|maintenance mechanic|building maintenance"),
    ("cnc-machinist", r"\bcnc\b|machinist"),
    ("heavy-equipment-operator", r"heavy equipment|equipment operator|excavator|backhoe|loader operator|dozer"),
    ("concrete-finisher", r"concrete|cement mason"),
    ("carpenter", r"\bcarpent"),
    ("delivery-driver", r"delivery driver|route driver|courier|box truck|non.?cdl|class b"),
    ("cdl-class-a-driver", r"\bcdl|class a|truck driver|tractor.?trailer|\botr\b"),
    ("dispatcher", r"dispatch"),
    ("general-laborer", r"\blabou?rer\b"),
    ("packer", r"\bpackers?\b|packag(ing|e) (operator|associate|technician|tech|worker)"),
    ("janitor", r"janitor|custodian|sanitation (worker|tech|associate|crew)|\bcleaner\b"),
    ("landscaper", r"landscap|groundskeep"),
]
LEAD_EXCLUDE = re.compile(r"manager|director|supervisor|\bvp\b|vice president|chief|head of|\bintern\b", re.I)
OFFICE_TITLE_ROLES = [
    ("safety-specialist", r"safety (tech|technician|specialist|coordinator|officer|representative)"),
    ("logistics-coordinator", r"logistics (coordinator|specialist|associate)|shipping coordinator"),
    ("supply-chain-analyst", r"supply chain (analyst|planner|specialist)|demand planner"),
    ("database-administrator", r"database admin|\bdba\b"),
    ("business-analyst", r"business (systems )?analyst"),
    ("executive-assistant", r"executive (administrative )?assistant"),
    ("administrative-assistant", r"admin(istrative)? assistant|office assistant"),
    ("receptionist", r"receptionist|front desk"),
    ("data-entry-clerk", r"data entry"),
    ("payroll-specialist", r"payroll"),
    ("accounts-payable-receivable", r"accounts (payable|receivable)|\b(ap|ar) (specialist|clerk)"),
    ("financial-analyst", r"financial analyst|fp&a analyst"),
    ("accountant", r"accountant"),
    ("bookkeeper", r"bookkeep"),
    ("customer-service-rep", r"customer (service|support|care|experience) (rep|specialist|associate|agent|advocate)|call center"),
    ("paralegal", r"paralegal|legal assistant"),
    ("attorney", r"attorney|lawyer|\bcounsel\b"),
    ("hr-generalist", r"human resources (generalist|specialist|coordinator|assistant)|\bhr (generalist|specialist|coordinator|assistant)"),
    ("recruiter", r"recruiter|talent acquisition (specialist|partner)|sourcer"),
]
NOT_RN = {"crna", "nurse-practitioner", "lpn-lvn", "cna"}
OCC_FALLBACK = {
    "General Labor": "general-laborer",
    "Assembler / Production Worker": "assembler",
    "Machine Operator / CNC": "machine-operator",
    "Quality Inspector": "quality-inspector",
    "Field Service Technician": "field-service-technician",
    "Cable / Low Voltage Tech": "low-voltage-technician",
    "Data Engineer / Analyst / Scientist": "data-engineer-analyst",
    "DevOps / Cloud / SRE": "devops-cloud-engineer",
    "Systems / Network Admin": "systems-network-administrator",
    "Help Desk / Desktop Support": "help-desk-technician",
    "QA / Test Engineer": "qa-test-engineer",
    "Cybersecurity": "cybersecurity-analyst",
    "IT Project / Product Manager": "it-project-manager",
}
RN_TITLE_SPECIALTIES = [(k, re.compile(rx, re.I)) for k, rx in RN_TITLE_SPECIALTIES]
CLINICAL_TITLE_ROLES = [(k, re.compile(rx, re.I)) for k, rx in CLINICAL_TITLE_ROLES]
TITLE_ROLES = [(k, re.compile(rx, re.I)) for k, rx in TITLE_ROLES]
OFFICE_TITLE_ROLES = [(k, re.compile(rx, re.I)) for k, rx in OFFICE_TITLE_ROLES]


def _first(rules, title):
    for role, rx in rules:
        if rx.search(title):
            return role
    return None


def role_for(occupation, detail, title):
    title = title or ""
    if occupation == RN:
        key = OCC_ROLES.get((RN, detail or "General"))
        if key == "registered-nurse":
            # The pipeline files some LPN / NP / CRNA / CNA titles under RN.
            other = None if CLINICAL_EXCLUDE.search(title) else _first(CLINICAL_TITLE_ROLES, title)
            if other in NOT_RN:
                return other
            return _first(RN_TITLE_SPECIALTIES, title) or key
        return key
    key = OCC_ROLES.get((occupation, None))
    if key:
        return key
    if not CLINICAL_EXCLUDE.search(title):
        key = _first(CLINICAL_TITLE_ROLES, title)
        if key:
            return key
    if not EXCLUDE.search(title):
        key = _first(TITLE_ROLES, title)
        if key:
            return key
    if not LEAD_EXCLUDE.search(title):
        key = _first(OFFICE_TITLE_ROLES, title)
        if key:
            return key
    return OCC_FALLBACK.get(occupation)


# ----------------------------------------------------------------- geography
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota",
    "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"}
BY_NAME = {v.lower(): k for k, v in STATE_NAMES.items()}


def state_code(value):
    s = (value or "").strip()
    return s.upper() if s.upper() in STATE_NAMES else BY_NAME.get(s.lower())


def city_key(city, state):
    c = " ".join(unicodedata.normalize("NFKD", city or "").encode("ascii", "ignore").decode().split())
    c = re.sub(r"^(greater|city of)\s+", "", c, flags=re.I)
    c = re.sub(r"\s+(county|metropolitan area|metro area|metro|area)$", "", c, flags=re.I).strip(" ,")
    if not c or c.lower() in ("remote", "united states", "us", "usa", "anywhere"):
        return None
    if state == "DC":
        c = "washington"
    slug = re.sub(r"[^a-z0-9]+", "-", c.lower().replace("st.", "st")).strip("-")
    return f"{state}:{slug}" if slug else None


# ------------------------------------------------------------------- helpers
def checks(firm_ids):
    """Privacy checks for one metric from its per-observation firm ids."""
    n = len(firm_ids)
    if n == 0 or any(f is None for f in firm_ids):
        return None
    counts = Counter(firm_ids)
    share = counts.most_common(1)[0][1] / n
    return {"status": "verified", "distinctFirms": len(counts), "maxFirmShare": round(share, 4)}


def passes(c):
    return bool(c) and c["distinctFirms"] >= MIN_FIRMS and c["maxFirmShare"] <= MAX_SHARE


def cents(x):
    return int((Decimal(str(x)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def pay_figures(values):
    v = sorted(values)
    q = statistics.quantiles(v, n=4, method="exclusive")
    p25, mid, p75 = (round(x, 2) for x in (q[0], statistics.median(v), q[2]))
    return cents(p25), cents(mid), cents(p75)


# --------------------------------------------------------------------- build
def build(pipeline, today, staffing_cids=None):
    db = Path(pipeline) / "db"
    sys.path.insert(0, str(Path(pipeline) / "src"))
    import taxonomy as tx  # pipeline's own title classifier (read-only use)

    j = sqlite3.connect(f"file:{(db / 'jsearch.sqlite').as_posix()}?mode=ro", uri=True, timeout=120)
    p = sqlite3.connect(f"file:{(db / 'pay_benchmarks.sqlite').as_posix()}?mode=ro", uri=True, timeout=120)

    built_at = p.execute("SELECT built_at FROM meta").fetchone()[0]
    built_date = dt.date.fromisoformat(built_at[:10])
    if (today - built_date).days > MAX_SOURCE_AGE_DAYS:
        raise SystemExit(f"REFUSED: pay_benchmarks built {built_at}, older than {MAX_SOURCE_AGE_DAYS} days")

    non_staffing = {r[0] for r in j.execute(
        "SELECT shared_company_id FROM search_targets WHERE COALESCE(search_error,'') LIKE 'non-staffing employer%'")}
    job = {}
    for jid, cid, detail, rf in j.execute(
            "SELECT canonical_job_id, shared_company_id, role_detail, role_family FROM canonical_jobs"):
        job[jid] = (cid, detail if (rf and "Nurse" in rf) else None)

    allow = set(staffing_cids) if staffing_cids is not None else None

    def staffing(cid):
        if cid is None:
            return False
        return cid in allow if allow is not None else cid not in non_staffing

    # ---- pay
    groups = defaultdict(list)  # (role, level, state, cityKey) -> [(value, firm)]
    pay_obs = 0
    for jid, occ, title, st, city, mid, pg in p.execute(
            "SELECT canonical_job_id, occupation, job_title, state, city, hourly_mid, pay_group "
            "FROM pay_observations WHERE plausible AND hourly_mid IS NOT NULL"):
        cid, detail = job.get(jid, (None, None))
        if pg == TRAVEL or not staffing(cid):
            continue
        pay_obs += 1
        role = role_for(occ, detail, title)
        if not role:
            continue
        groups[(role, "nationwide", None, None)].append((mid, cid))
        sc = state_code(st)
        if sc:
            groups[(role, "state", sc, None)].append((mid, cid))
            ck = city_key(city, sc)
            if ck:
                groups[(role, "city", sc, ck)].append((mid, cid))

    pay, withheld_pay = [], Counter()
    role_cov = defaultdict(lambda: {"nationwide": "no_data", "stateCells": 0, "cityCells": 0,
                                    "withheldCells": 0, "observations": 0})
    for (role, level, sc, ck), rows in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or "", kv[0][3] or "")):
        c = checks([f for _, f in rows])
        rc = role_cov[role]
        if level == "nationwide":
            rc["observations"] = len(rows)
        if not passes(c) or len(rows) < MIN_FIRMS:
            withheld_pay[level] += 1
            rc["withheldCells"] += 1
            if level == "nationwide":
                rc["nationwide"] = "withheld"
            continue
        p25, typ, p75 = pay_figures([v for v, _ in rows])
        pay.append({"roleKey": role, "level": level, "state": sc, "city": ck, "p25Cents": p25,
                    "typicalCents": typ, "p75Cents": p75, "payBasis": "hourly", "currency": "USD", "checks": c})
        if level == "nationwide":
            rc["nationwide"] = "publishable"
        else:
            rc[f"{level}Cells"] += 1

    # ---- demand
    cut_latest = (today - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    cut_prev = (today - dt.timedelta(days=2 * WINDOW_DAYS)).isoformat()
    seen_fp = set()
    city_firms = defaultdict(list)
    state_win = {"cur": defaultdict(list), "prev": defaultdict(list)}
    fam = defaultdict(list)
    firms_90, postings_90 = set(), 0
    occ_cache = {}
    for title, st, city, cid, fp, d in j.execute(
            "SELECT job_title, state, city, shared_company_id, fingerprint_hash, "
            "substr(COALESCE(posting_date, first_seen_date), 1, 10) AS d FROM canonical_jobs "
            "WHERE COALESCE(duplicate_status,'new') <> 'repost' AND d >= ? AND d <= ? "
            "AND (country IS NULL OR upper(country) IN ('US','USA','UNITED STATES'))",
            (cut_prev, today.isoformat())):
        if not staffing(cid):
            continue
        if fp:
            if fp in seen_fp:
                continue
            seen_fp.add(fp)
        postings_90 += 1
        firms_90.add(cid)
        if title not in occ_cache:
            o = tx.classify_occupation(title or "")
            occ_cache[title] = o[1] if o and o[1] else None
        if occ_cache[title]:
            fam[occ_cache[title]].append(cid)
        sc = state_code(st)
        if not sc:
            continue
        latest = d >= cut_latest
        state_win["cur" if latest else "prev"][sc].append(cid)
        if latest:
            ck = city_key(city, sc)
            if ck:
                city_firms[ck].append(cid)

    city_rows, withheld_city = [], 0
    for ck, firm_ids in sorted(city_firms.items(), key=lambda kv: -len(kv[1])):
        c = checks(firm_ids)
        if not passes(c):
            withheld_city += 1
            continue
        if len(city_rows) < CITY_ROWS_CAP:
            city_rows.append({"cityKey": ck, "postings": len(firm_ids), "checks": c})

    tot_cur = sum(len(v) for v in state_win["cur"].values())
    tot_prev = sum(len(v) for v in state_win["prev"].values())
    mom_rows, withheld_mom = [], 0
    for sc in sorted(set(state_win["cur"]) | set(state_win["prev"])):
        cur, prev = state_win["cur"].get(sc, []), state_win["prev"].get(sc, [])
        c1, c2 = checks(cur), checks(prev)
        if not (passes(c1) and passes(c2)) or len(prev) < 20 or len(cur) + len(prev) < 50 or not tot_prev:
            withheld_mom += 1
            continue
        pct = ((len(cur) / len(prev)) / (tot_cur / tot_prev) - 1) * 100
        mom_rows.append({"code": sc, "momentumPct": round(pct), "checks": {
            "status": "verified", "distinctFirms": min(c1["distinctFirms"], c2["distinctFirms"]),
            "maxFirmShare": max(c1["maxFirmShare"], c2["maxFirmShare"])}})

    fam_labels = [name for name, ids in sorted(fam.items(), key=lambda kv: -len(kv[1])) if passes(checks(ids))][:10]

    # ---- issue cards (only from publishable rows)
    cards = []
    heating = sorted(mom_rows, key=lambda r: -r["momentumPct"])
    if heating and heating[0]["momentumPct"] > 0:
        code = heating[0]["code"]
        cards.append({"key": f"momentum-{code.lower()}", "kind": "momentum",
                      "title": f"{STATE_NAMES[code]}: an early upward signal.", "ref": {"code": code},
                      "basis": f"Latest {WINDOW_DAYS} days vs. previous {WINDOW_DAYS}, relative to all observed states. Early signal."})
    nat = [c for c in pay if c["level"] == "nationwide"]
    if nat:
        top = max(nat, key=lambda c: role_cov[c["roleKey"]]["observations"])
        cards.append({"key": f"pay-{top['roleKey']}", "kind": "pay", "title": "Most-advertised pay snapshot.",
                      "ref": {"roleKey": top["roleKey"]}, "basis": "Staffing-firm postings only. Advertised pay, not actual pay."})
    if city_rows:
        cards.append({"key": "volume-top-city", "kind": "volume", "title": "Highest observed city volume.",
                      "ref": {"cityKey": city_rows[0]["cityKey"]}, "basis": "Observed postings, not verified open orders."})

    city_count = len(city_rows) + withheld_city
    data = {
        "snapshot": {
            "label": today.strftime("Week of %B %d, %Y").replace(" 0", " "),
            "exactDate": today.isoformat(),
            "freshness": "current",
            "lastSuccessfulRefresh": today.isoformat(),
            "refreshCadence": "weekly",
            "methodologyVersion": CALC_VERSION,
            "note": "Staffing-firm postings only. Advertised pay, not actual pay.",
        },
        "coverage": {
            "postings": {"value": postings_90, "approximate": False, "period": "last 90 days"},
            "firms": {"value": len(firms_90), "approximate": False, "period": "last 90 days"},
            "payObservations": {"value": pay_obs, "approximate": False,
                                "note": "Includes salaries converted at 2,080 hours/year"},
            "citiesLabel": f"{len(city_rows) + 0:,}",
            "reliablePayTitles": sum(1 for c in nat),
            "jobCityPayCombos": {"value": sum(1 for c in pay if c["level"] == "city"), "approximate": False,
                                 "note": "Job/city combinations, not fully covered cities"},
        },
        "issueCards": cards,
        "cityVolume": {"metric": "New staffing-firm postings observed", "windowDays": WINDOW_DAYS,
                       "scope": "Nationwide · all sectors · all jobs", "jobScope": "all jobs", "rows": city_rows},
        "momentum": {"windowDays": WINDOW_DAYS, "previousWindowDays": WINDOW_DAYS, "isRawGrowth": False,
                     "isPayChange": False, "isForecast": False,
                     "basis": (f"Normalized posting momentum: latest {WINDOW_DAYS} days vs. the previous {WINDOW_DAYS}, "
                               "measured relative to the change across all observed states. Early signal — not raw "
                               "growth, a demand forecast or a pay change."),
                     "historyNote": "Early signals. Comparable history is still short.",
                     "coverage": "publishable", "rows": mom_rows},
        "pay": pay,
        "mostPostedFamilies": {"labels": fam_labels,
                               "note": "Mixed granularity; several are broad families, not job titles."},
    }
    meta = {
        "format": FORMAT, "schemaVersion": SCHEMA_VERSION, "calcVersion": CALC_VERSION,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "snapshotDate": today.isoformat(), "sourceBuiltAt": built_at,
        "method": {
            "privacyRule": {"minDistinctFirms": MIN_FIRMS, "maxFirmShare": MAX_SHARE, "shareOperator": "<=",
                            "appliesTo": "every pay cell, city row, momentum row (each window) and posting family"},
            "firmIdentity": "shared_company_id",
            "staffingFirms": "all companies except search_targets flagged 'non-staffing employer' (2026-10-02)",
            "payValue": "hourly_mid per posting; travel weekly packages excluded",
            "quantile": "statistics.quantiles(n=4, method='exclusive'); typical = median",
            "newPosting": "COALESCE(posting_date, first_seen_date); reposts and repeat fingerprints dropped",
            "cityVolumeWindowDays": WINDOW_DAYS,
        },
        "withheld": {"pay": dict(withheld_pay), "cityVolume": withheld_city, "momentum": withheld_mom},
        "roleCoverage": {k: role_cov[k] for k in sorted(role_cov)},
        "data": data,
    }
    return meta, city_count


# Supplied October fixture national figures (cents): reproduction guard.
FIXTURE = {"registered-nurse": (4100, 5000, 6200), "icu-registered-nurse": (4800, 5738, 6503),
           "warehouse-associate": (1700, 1900, 2200), "forklift-operator": (1713, 1850, 2000)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pipeline", default=str(DEFAULT_PIPELINE))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--today", help="YYYY-MM-DD (testing)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--staffing-cids", help="JSON list of shared_company_ids to use as the staffing-firm set "
                    "(reproduces the October fixture with the 2026-10-02 list)")
    a = ap.parse_args()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    cids = json.load(open(a.staffing_cids, encoding="utf-8")) if a.staffing_cids else None
    snap, _ = build(a.pipeline, today, cids)
    d = snap["data"]
    nat = {c["roleKey"]: (c["p25Cents"], c["typicalCents"], c["p75Cents"]) for c in d["pay"] if c["level"] == "nationwide"}
    drift = {k: (nat.get(k), v) for k, v in FIXTURE.items() if nat.get(k) != v}
    print(f"{CALC_VERSION} snapshot {snap['snapshotDate']}: pay cells {len(d['pay'])} "
          f"(withheld {snap['withheld']['pay']}), city rows {len(d['cityVolume']['rows'])} "
          f"(withheld {snap['withheld']['cityVolume']}), momentum {len(d['momentum']['rows'])} "
          f"(withheld {snap['withheld']['momentum']}), families {len(d['mostPostedFamilies']['labels'])}")
    print("fixture reproduction:", "exact" if not drift else f"DRIFT {drift}")
    if not d["pay"] or not d["cityVolume"]["rows"]:
        print("REFUSED: no publishable pay or city data")
        return 2
    if a.dry_run:
        return 0
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=out.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, out)
    print("wrote", out, f"{out.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
