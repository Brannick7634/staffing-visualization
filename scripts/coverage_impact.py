"""Before/after coverage of the signal-agg-2.0.0 benchmark population.

Reads the pipeline databases READ-ONLY, applies the legacy (1.2.0) rule and the
new population rule to the same observations with the same cell/privacy code,
and writes a compact summary to out/candidate/coverage_impact.json. Prints a
short digest; never prints rows.

    python scripts/coverage_impact.py [--pipeline DIR] [--out FILE]
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_signal_snapshot as ex  # noqa: E402
import signal_population as pop  # noqa: E402

SMALL = (5, 10, 20, 30)


def summarize(obs, cells):
    by_level = Counter(c["level"] for c in cells)
    small = {f"under{n}": sum(1 for c in cells if c["observations"] < n) for n in SMALL}
    firms = Counter(c["checks"]["distinctFirms"] for c in cells)
    return {
        "eligibleObservations": len(obs),
        "contributingFirms": len({o[4] for o in obs}),
        "publishableCells": dict(by_level),
        "publishableJobLocationCombos": by_level["state"] + by_level["city"],
        "publishableRolesNationwide": by_level["nationwide"],
        "cellsByObservationCount": small,
        "cellsUnder5Firms": sum(n for f, n in firms.items() if f < 5),
        "minObservationsInAPublishedCell": min((c["observations"] for c in cells), default=None),
        "cellsWithExactly3Observations": sum(1 for c in cells if c["observations"] == 3),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pipeline", default=str(ex.DEFAULT_PIPELINE))
    ap.add_argument("--out", default=str(ex.REPO / "out" / "candidate" / "coverage_impact.json"))
    a = ap.parse_args()
    j = ex.connect(a.pipeline)
    firms = pop.load_firms(j)
    legacy_flagged = pop.legacy_staffing(j)

    rows = []  # (role, state, city, mid, firm_key, cid, reasons, legacy_ok, posted_as)
    for o in pop.iter_observations(j, firms):
        role = ex.role_for(o["occupation"], o["detail"], o["title"])
        legacy_ok = bool(o["plausible"]) and o["pay_group"] != pop.TRAVEL and o["cid"] is not None \
            and o["cid"] not in legacy_flagged
        rows.append((role, o["state"], o["city"], o["mid"], o["firm_key"], o["cid"],
                     frozenset(o["reasons"]), legacy_ok, o["posted_as"]))

    def cells(sel, firm_index):
        obs = [r for r in rows if r[0] and sel(r)]
        tuples = [(r[0], r[1], r[2], r[3], r[firm_index]) for r in obs]
        pay, _, _ = ex.pay_cells(tuples)
        return [(r[0], r[1], r[2], r[3], r[firm_index]) for r in obs], pay

    legacy_obs, legacy_cells = cells(lambda r: r[7], 5)  # legacy identity = shared_company_id
    new_obs, new_cells = cells(lambda r: not r[6], 4)

    # Reproduce the audit findings on the legacy population.
    legacy_rows = [r for r in rows if r[7]]
    status = Counter(firms[r[5]][0] if r[5] in firms else "unlinked" for r in legacy_rows)
    repro = {
        "legacyAdmittedByPostedPeriod": dict(Counter(r[8] for r in legacy_rows)),
        "legacyAdmittedByFirmStatusUnderNewRule": dict(status),
        "legacyAdmittedWithoutContractEvidence": sum(
            1 for r in legacy_rows if r[6] & {"no_contract_evidence", "employment_type_missing",
                                              "employment_type_mixed", "internship"}),
    }

    # Exclusions by reason (overlapping) and by SOLE reason (non-overlapping).
    held = [r for r in rows if r[6]]
    by_reason = Counter(x for r in held for x in r[6])
    sole = Counter(next(iter(r[6])) for r in held if len(r[6]) == 1)
    groups = {"pay": lambda x: x.startswith("pay_period") or x in (
        "travel_weekly_package", "stipend_or_per_diem", "implausible_pay", "currency_not_usd", "currency_not_stated"),
        "employment": lambda x: x.startswith("employment") or x in ("no_contract_evidence", "internship"),
        "firm": lambda x: x.startswith("firm_"), "dedupe": lambda x: x == "repost"}
    by_group = Counter()
    for r in held:
        for g, f in groups.items():
            if any(f(x) for x in r[6]):
                by_group[g] += 1
    sizes = Counter(min(len(r[6]), 4) for r in held)

    # Sensitivity (NOT applied): what each contested rule costs on its own.
    def relax(drop):
        o, c = cells(lambda r: not (r[6] - drop), 4)
        return summarize(o, c)
    sensitivity = {
        "ifJSearchStructuredPayAcceptedAsUSD": relax({"currency_not_stated"}),
        "ifMixedEmploymentLabelsAccepted": relax({"employment_type_mixed"}),
        "ifFirmUnknownAccepted": relax({"firm_unknown"}),
    }

    verified = [c for c, f in firms.items() if f[0] == "verified"]
    identity = {"verifiedCompanyIds": len(verified), "verifiedFirmKeys": len({firms[c][2] for c in verified}),
                "firmStatusCounts": dict(Counter(f[0] for f in firms.values()))}

    out = {
        "totalObservations": len(rows), "reproduction": repro,
        "before": summarize(legacy_obs, legacy_cells), "after": summarize(new_obs, new_cells),
        "heldOutByReasonOverlapping": dict(by_reason.most_common()),
        "heldOutBySoleReason": dict(sole.most_common()),
        "heldOutByRuleGroupOverlapping": dict(by_group),
        "heldOutByNumberOfReasons": {("4+" if k == 4 else str(k)): v for k, v in sorted(sizes.items())},
        "heldOutTotal": len(held), "eligibleBeforeRoleMapping": len(rows) - len(held),
        "sensitivityNotApplied": sensitivity, "firmIdentity": identity,
    }
    p = Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=1), encoding="utf-8")
    b, f = out["before"], out["after"]
    print(f"observations {len(rows):,}: before {b['eligibleObservations']:,} -> after {f['eligibleObservations']:,}; "
          f"firms {b['contributingFirms']:,} -> {f['contributingFirms']:,}; "
          f"job/location combos {b['publishableJobLocationCombos']:,} -> {f['publishableJobLocationCombos']:,}; "
          f"nationwide roles {b['publishableRolesNationwide']} -> {f['publishableRolesNationwide']}")
    print("wrote", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
