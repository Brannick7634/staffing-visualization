"""Benchmark population rules for The Staffing Signal (calc signal-agg-2.0.0).

One place that decides which advertised-pay observations may enter the hourly
benchmark, and which companies count as staffing firms. Used by
export_signal_snapshot.py, export_signal_monthly.py and coverage_impact.py.

Every rule reads a REAL upstream field (listed in SOURCE_FIELDS). Where the
source has no evidence for a requirement the record is held OUT and the reason
is recorded; nothing is inferred to fill a gap.

An observation is eligible only when ALL hold (a record can fail several; every
failing reason is recorded, so exclusion counts overlap):
  1. Pay  - originally advertised per HOUR (pay_observations.posted_as =
     'hourly'); not a travel weekly package; no per-diem/stipend wording in the
     title; inside the pipeline's plausible band; USD evidenced.
  2. Work - any employment label except internship (contract/temp label dropped 2026-10-18).
     Full-time or part-time alone is not evidence either way, mixed labels
     (e.g. "Full-time and Contractor") are ambiguous, missing labels are
     unknown: all held out.
  3. Firm - the company is POSITIVELY verified as a staffing firm (see
     firm_status) and nothing conflicts. Unknown and conflicting are held out.
  4. Dedupe - fingerprint duplicates are already removed upstream
     (pay_benchmarks.py, one row per fingerprint); reposts are dropped here.
"""
import json
import re
import unicodedata

POPULATION_VERSION = "population-2.0.0"
TRAVEL = "Travel weekly package"

# Real upstream fields each rule reads (documented in docs/repair/DATA_CONTRACT.md).
SOURCE_FIELDS = {
    "pay_period": "pay_benchmarks.pay_observations.posted_as (from canonical_jobs.salary_period for JSearch; "
                  "salary_string wording for JobsPipe; the extractor's own unit for description pay)",
    "pay_origin": "pay_benchmarks.pay_observations.pay_from",
    "travel_package": "pay_benchmarks.pay_observations.pay_group",
    "stipend": "pay_benchmarks.pay_observations.per_diem",
    "plausible": "pay_benchmarks.pay_observations.plausible",
    "currency": "canonical_jobs.raw_json $.salary_currency (JobsPipe only; JSearch sends no currency field)",
    "employment_labels": "canonical_jobs.raw_json $.job_employment_types (JSearch) / $.employment_statuses (JobsPipe), "
                         "else canonical_jobs.employment_type",
    "posting_employer_type": "canonical_jobs.raw_json $.employer_type (JobsPipe: agency / broker / employer)",
    "firm_segment": "company_identity.staffing_segment",
    "firm_flags": "search_targets.search_error ('non-staffing employer...' and 'Excluded: real Industry classification...')",
    "firm_identity": "company_identity.legal_company_name (normalized), else normalized_domain, else shared_company_id",
    "dedupe": "pay_observations is one row per fingerprint_hash; canonical_jobs.duplicate_status = 'repost' dropped",
}

# company_identity.staffing_segment values that name a STAFFING segment. The
# column also holds plain industry values copied from another field (Retail,
# Hospitals, Restaurants, "Manufacturing - Metal and Concrete"...), so values
# that could be either an industry or a staffing specialty (Construction,
# Manufacturing, Healthcare, IT, Energy...) are NOT positive evidence.
STAFFING_SEGMENTS = frozenset(s.lower() for s in (
    "Healthcare Staffing", "Light Industrial", "IT Professional", "Skilled Trades", "Technical",
    "Admin", "professional", "skilled", "Executive Recruiting",
))
# Segments that say the company is NOT a temporary-staffing employer of record.
NON_STAFFING_SEGMENTS = frozenset(s.lower() for s in ("PEO", "EOR", "Vendor", "Unions"))
NON_STAFFING_FLAGS = ("non-staffing employer", "excluded: real industry classification")

CONTRACT_LABELS = {"contract", "contractor", "temporary", "temp"}
LABEL_MAP = {
    "fulltime": "full_time", "full-time": "full_time", "full time": "full_time", "full_time": "full_time",
    "parttime": "part_time", "part-time": "part_time", "part time": "part_time", "part_time": "part_time",
    "intern": "internship", "internship": "internship",
    "contractor": "contract", "contract": "contract", "temporary": "temporary", "temp": "temporary",
}

# Exclusion reasons (stable keys; COVERAGE_IMPACT.md and tests use them).
R = {
    "annual": "pay_period_annual", "weekly": "pay_period_weekly", "monthly": "pay_period_monthly",
    "daily": "pay_period_daily",
}


def pay_reasons(posted_as, pay_group, per_diem, plausible, pay_from, currency):
    """Reasons this observation's pay is not originally advertised hourly USD base pay."""
    out = []
    if posted_as != "hourly":
        out.append(R.get(posted_as, "pay_period_unknown"))
    if pay_group == TRAVEL:
        out.append("travel_weekly_package")
    if per_diem:
        out.append("stipend_or_per_diem")
    if not plausible:
        out.append("implausible_pay")
    cur = (currency or "").strip().upper()
    if cur and cur != "USD":
        out.append("currency_not_usd")
    # A blank currency is accepted (Andy, 2026-10-16): JSearch structured
    # salaries never state one and the searches are U.S.-only. Only an
    # explicit non-USD currency is excluded.
    return out


def labels_of(raw_labels, employment_type):
    """Normalized employment labels from the posting's own fields."""
    vals = []
    if raw_labels:
        try:
            parsed = json.loads(raw_labels) if isinstance(raw_labels, str) else raw_labels
            vals = list(parsed) if isinstance(parsed, (list, tuple)) else [parsed]
        except (ValueError, TypeError):
            vals = []
    if not vals and employment_type:
        vals = re.split(r",\s*|\s+and\s+", str(employment_type))
    out = set()
    for v in vals:
        k = str(v or "").strip().lower()
        if k:
            out.add(LABEL_MAP.get(k, "other"))
    return out


def employment_reason(labels):
    """None unless the posting is an internship (Andy, 2026-10-18).

    Staffing firms label most contract assignments "full-time", so a contract/temp
    label is no longer required; hourly pay from a verified staffing firm is the test."""
    if "internship" in labels:
        return "internship"
    return None


def firm_status(segment, flags, provider_votes):
    """('verified' | 'unknown' | 'conflicting', evidence) for one company.

    Positive evidence: a staffing segment in company_identity.staffing_segment,
    or agency + broker votes COMBINED forming a strict majority (more than half)
    of ALL the company's JobsPipe-classified postings (every category, including
    unknown/other, is in the denominator). Andy approved combining 2026-10-16.
    Negative evidence: a non-staffing search_targets flag, a PEO / EOR / vendor
    segment, or (when agency + broker is not a majority) employer votes at least
    equal to agency + broker. An exact tie (half provider, half employer) is
    therefore negative, never verified. Posting-level 'employer' exclusions are
    applied separately in observation_reasons."""
    seg = (segment or "").strip().lower()
    pos, neg = [], []
    if seg in STAFFING_SEGMENTS:
        pos.append("segment")
    if seg in NON_STAFFING_SEGMENTS:
        neg.append("segment")
    for f in flags or ():
        if any((f or "").lower().startswith(x) for x in NON_STAFFING_FLAGS):
            neg.append("flag")
    votes = provider_votes or {}
    if votes:
        total = sum(n for n in votes.values() if n)
        provider = (votes.get("agency") or 0) + (votes.get("broker") or 0)
        employer = votes.get("employer") or 0
        if total and provider * 2 > total:
            pos.append("provider")
        elif employer and employer >= provider:
            neg.append("provider")
    # A staffing segment outranks JobsPipe employer votes (Andy 2026-10-19):
    # JobsPipe often tags an agency's postings with the client as employer.
    # Non-staffing flags and PEO/EOR/vendor segments still conflict.
    if "segment" in pos and neg == ["provider"]:
        return "verified", "segment over provider"
    if pos and neg:
        return "conflicting", "+".join(pos) + " vs " + "+".join(neg)
    if pos:
        return "verified", "+".join(pos)
    return "unknown", "+".join(neg) if neg else "no evidence"


LEGAL_SUFFIX = re.compile(r"\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|lp|llp|pllc|pc)\b\.?", re.I)


def firm_key(name, domain, cid):
    """Identity used for the privacy rule: equivalent names collapse to one firm.

    Merging two genuinely different firms only lowers the distinct-firm count
    (more withholding), so the conservative direction is to merge."""
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    n = n.replace("&", " and ")
    n = LEGAL_SUFFIX.sub(" ", n)
    n = re.sub(r"[^a-z0-9]+", " ", n).strip()
    n = re.sub(r"^the ", "", n)
    if n:
        return "n:" + n
    if domain:
        return "d:" + domain.strip().lower()
    return None if cid is None else f"c:{cid}"


def observation_reasons(o, firm):
    """Every reason one observation is held out (empty list = eligible).

    `o` keys: posted_as, pay_group, per_diem, plausible, pay_from, currency,
    labels (set), duplicate_status, posting_employer_type.
    `firm`: firm_status() tuple for its company, or None when the posting has
    no company link."""
    out = pay_reasons(o.get("posted_as"), o.get("pay_group"), o.get("per_diem"), o.get("plausible"),
                      o.get("pay_from"), o.get("currency"))
    er = employment_reason(o.get("labels") or set())
    if er:
        out.append(er)
    if firm is None:
        out.append("firm_unlinked")
    elif firm[0] != "verified":
        out.append("firm_" + firm[0])
    elif (o.get("posting_employer_type") or "") == "employer":
        out.append("firm_conflicting")  # this posting says direct employer
    if (o.get("duplicate_status") or "new") == "repost":
        out.append("repost")
    return out


# ------------------------------------------------------------------ loading
def load_firms(j):
    """{shared_company_id: (status, evidence, firm_key)} from the jsearch db (read-only)."""
    flags = {}
    for cid, err in j.execute("SELECT shared_company_id, search_error FROM search_targets WHERE search_error IS NOT NULL"):
        flags.setdefault(cid, []).append(err)
    votes = {}
    for cid, et, n in j.execute(
            "SELECT shared_company_id, json_extract(raw_json,'$.employer_type'), COUNT(*) FROM canonical_jobs "
            "WHERE source='jobspipe' AND raw_json IS NOT NULL GROUP BY 1, 2"):
        if et:
            votes.setdefault(cid, {})[et] = n
    out = {}
    for cid, seg, dom, name in j.execute(
            "SELECT shared_company_id, staffing_segment, normalized_domain, legal_company_name FROM company_identity"):
        st, ev = firm_status(seg, flags.get(cid), votes.get(cid))
        out[cid] = (st, ev, firm_key(name, dom, cid))
    return out


def legacy_staffing(j):
    """The pre-2.0.0 rule: every company unless flagged 'non-staffing employer'."""
    return {r[0] for r in j.execute(
        "SELECT shared_company_id FROM search_targets WHERE COALESCE(search_error,'') LIKE 'non-staffing employer%'")}


PAY_SQL = (
    "SELECT o.canonical_job_id, o.occupation, o.job_title, o.state, o.city, o.hourly_mid, o.pay_group, "
    "o.posted_as, o.per_diem, o.plausible, o.pay_from, substr(o.posting_date,1,10), substr(o.last_seen_date,1,10), "
    "c.shared_company_id, c.role_detail, c.role_family, c.duplicate_status, c.employment_type, "
    "json_extract(c.raw_json,'$.salary_currency'), "
    "COALESCE(json_extract(c.raw_json,'$.job_employment_types'), json_extract(c.raw_json,'$.employment_statuses')), "
    "CASE WHEN c.source='jobspipe' THEN json_extract(c.raw_json,'$.employer_type') END "
    "FROM p.pay_observations o LEFT JOIN canonical_jobs c ON c.canonical_job_id = o.canonical_job_id "
    "WHERE o.hourly_mid IS NOT NULL")


def iter_observations(j, firms):
    """Yield one dict per pay observation with its hold-out reasons. `j` must
    have pay_benchmarks.sqlite attached as `p`."""
    for (jid, occ, title, st, city, mid, pg, posted_as, per_diem, plausible, pay_from, posted, last_seen,
         cid, detail, rf, dup, etype, currency, raw_labels, pet) in j.execute(PAY_SQL):
        firm = firms.get(cid) if cid is not None else None
        o = {"jid": jid, "occupation": occ, "title": title, "state": st, "city": city, "mid": mid,
             "pay_group": pg, "posted_as": posted_as, "per_diem": per_diem, "plausible": plausible,
             "pay_from": pay_from, "posted": posted, "last_seen": last_seen, "cid": cid,
             "detail": detail if (rf and "Nurse" in rf) else None, "duplicate_status": dup,
             "currency": currency, "labels": labels_of(raw_labels, etype), "posting_employer_type": pet,
             "firm_key": firm[2] if firm else None}
        o["reasons"] = observation_reasons(o, firm)
        yield o
