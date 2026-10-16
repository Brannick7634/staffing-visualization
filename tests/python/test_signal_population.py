"""Regression tests for the signal-agg-2.0.0 benchmark population.

Run: python -m unittest discover -s tests/python
(npm test runs this too, via tests/signal/population.test.mjs, when python is on PATH.)

ALL DATA HERE IS A CLEARLY MARKED LOCAL FIXTURE: synthetic companies ("Fixture
Staffing A"...) and postings built in a temporary sqlite file with the real
upstream column names. Nothing is read from or written to the pipeline.
"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import signal_population as pop  # noqa: E402
import export_signal_snapshot as ex  # noqa: E402

OK_FIRM = ("verified", "segment", "n:fixture staffing a")


def obs(**kw):
    """One eligible LOCAL FIXTURE observation; override a field to break one rule."""
    o = {"posted_as": "hourly", "pay_group": "Contract/Temp", "per_diem": 0, "plausible": 1,
         "pay_from": "salary fields", "currency": "USD", "labels": {"contract"},
         "duplicate_status": "new", "posting_employer_type": "agency"}
    o.update(kw)
    return o


class PayPeriod(unittest.TestCase):
    def test_hourly_usd_contract_verified_is_eligible(self):
        self.assertEqual(pop.observation_reasons(obs(), OK_FIRM), [])

    def test_annual_to_hourly_conversion_excluded(self):
        self.assertIn("pay_period_annual", pop.observation_reasons(obs(posted_as="annual"), OK_FIRM))

    def test_weekly_monthly_daily_excluded(self):
        for p in ("weekly", "monthly", "daily", "unknown", None):
            self.assertTrue(any(r.startswith("pay_period_") for r in pop.observation_reasons(obs(posted_as=p), OK_FIRM)), p)

    def test_travel_package_and_stipend_excluded(self):
        self.assertIn("travel_weekly_package", pop.observation_reasons(obs(pay_group=pop.TRAVEL), OK_FIRM))
        self.assertIn("stipend_or_per_diem", pop.observation_reasons(obs(per_diem=1), OK_FIRM))

    def test_implausible_excluded(self):
        self.assertIn("implausible_pay", pop.observation_reasons(obs(plausible=0), OK_FIRM))

    def test_currency(self):
        self.assertIn("currency_not_usd", pop.observation_reasons(obs(currency="CAD"), OK_FIRM))
        # Structured salary with no currency field (JSearch): held out.
        self.assertIn("currency_not_stated", pop.observation_reasons(obs(currency=None), OK_FIRM))
        # Description pay is only ever read from "$" figures by the extractor.
        self.assertEqual(pop.observation_reasons(obs(currency=None, pay_from="description"), OK_FIRM), [])


class Employment(unittest.TestCase):
    def test_labels_from_real_fields(self):
        self.assertEqual(pop.labels_of('["CONTRACTOR"]', "Full-time"), {"contract"})
        self.assertEqual(pop.labels_of('["contract","temporary"]', None), {"contract", "temporary"})
        self.assertEqual(pop.labels_of(None, "Full-time and Contractor"), {"full_time", "contract"})
        self.assertEqual(pop.labels_of(None, None), set())

    def test_full_time_alone_is_not_evidence(self):
        self.assertEqual(pop.employment_reason({"full_time"}), "no_contract_evidence")
        self.assertEqual(pop.employment_reason({"part_time"}), "no_contract_evidence")

    def test_mixed_missing_intern_held_out(self):
        self.assertEqual(pop.employment_reason({"full_time", "contract"}), "employment_type_mixed")
        self.assertEqual(pop.employment_reason(set()), "employment_type_missing")
        self.assertEqual(pop.employment_reason({"internship"}), "internship")
        self.assertIsNone(pop.employment_reason({"temporary"}))


class Firms(unittest.TestCase):
    def test_unknown_is_not_staffing(self):
        self.assertEqual(pop.firm_status(None, None, None)[0], "unknown")
        self.assertEqual(pop.firm_status("Unclassified", None, None)[0], "unknown")
        # An industry value is not staffing evidence.
        self.assertEqual(pop.firm_status("Hospitals", None, None)[0], "unknown")
        self.assertEqual(pop.firm_status("Manufacturing", None, None)[0], "unknown")

    def test_positive_evidence(self):
        self.assertEqual(pop.firm_status("Light Industrial", None, None)[0], "verified")
        self.assertEqual(pop.firm_status(None, None, {"agency": 9, "employer": 1})[0], "verified")

    def test_conflicts_excluded(self):
        self.assertEqual(pop.firm_status("Healthcare Staffing", None, {"employer": 5, "agency": 1})[0], "conflicting")
        self.assertEqual(pop.firm_status("Light Industrial", ["non-staffing employer (disabled 2026-10-02)"], None)[0], "conflicting")
        self.assertEqual(pop.firm_status("PEO", None, {"agency": 3})[0], "conflicting")

    def test_reasons(self):
        self.assertIn("firm_unknown", pop.observation_reasons(obs(), ("unknown", "", "x")))
        self.assertIn("firm_conflicting", pop.observation_reasons(obs(), ("conflicting", "", "x")))
        self.assertIn("firm_unlinked", pop.observation_reasons(obs(), None))
        self.assertIn("firm_conflicting", pop.observation_reasons(obs(posting_employer_type="employer"), OK_FIRM))

    def test_equivalent_names_are_one_firm(self):
        a = pop.firm_key("Acme Staffing, Inc.", "acme.com", 1)
        self.assertEqual(a, pop.firm_key("ACME Staffing LLC", "acmestaffing.net", 2))
        self.assertEqual(a, pop.firm_key("The Acme Staffing Co.", None, 3))
        self.assertNotEqual(a, pop.firm_key("Acme Nursing", None, 4))
        self.assertEqual(pop.firm_key(None, "x.com", 5), "d:x.com")


class Dedupe(unittest.TestCase):
    def test_repost_dropped(self):
        self.assertIn("repost", pop.observation_reasons(obs(duplicate_status="repost"), OK_FIRM))


class Cells(unittest.TestCase):
    def test_counts_and_privacy_rule_unchanged(self):
        self.assertEqual((ex.MIN_FIRMS, ex.MAX_SHARE), (3, 0.5))
        rows = [("forklift-operator", "TX", "Houston", 20.0 + i, f"n:firm{i % 3}") for i in range(9)]
        pay, withheld, cov = ex.pay_cells(rows)
        nat = [c for c in pay if c["level"] == "nationwide"][0]
        self.assertEqual(nat["observations"], 9)
        self.assertEqual(nat["checks"]["distinctFirms"], 3)
        # Two names of the same firm do not make a third contributor.
        pay2, _, _ = ex.pay_cells([("forklift-operator", "TX", "Houston", 20.0, "n:a"),
                                   ("forklift-operator", "TX", "Houston", 21.0, "n:a"),
                                   ("forklift-operator", "TX", "Houston", 22.0, "n:b")])
        self.assertEqual(pay2, [])


def fixture_db(tmp):
    """LOCAL FIXTURE pipeline (synthetic rows, real column names) in `tmp`/db."""
    db = Path(tmp) / "db"
    db.mkdir()
    j = sqlite3.connect(db / "jsearch.sqlite")
    j.executescript("""
      CREATE TABLE company_identity (shared_company_id INTEGER, legal_company_name TEXT, normalized_domain TEXT, staffing_segment TEXT);
      CREATE TABLE search_targets (shared_company_id INTEGER, search_error TEXT);
      CREATE TABLE canonical_jobs (canonical_job_id INTEGER, shared_company_id INTEGER, source TEXT, raw_json TEXT,
        role_detail TEXT, role_family TEXT, duplicate_status TEXT, employment_type TEXT, first_seen_date TEXT);
    """)
    j.executemany("INSERT INTO company_identity VALUES (?,?,?,?)", [
        (1, "Fixture Staffing A", "a.example", "Light Industrial"),
        (2, "Fixture Staffing B", "b.example", "Light Industrial"),
        (3, "Fixture Unknown Co", "u.example", None),
        (4, "Fixture Direct Employer", "d.example", "Light Industrial"),
    ])
    j.execute("INSERT INTO search_targets VALUES (4, 'non-staffing employer (disabled 2026-10-02)')")
    jobs = [  # id, cid, source, raw, employment_type
        (10, 1, "jobspipe", {"salary_currency": "USD", "employment_statuses": ["contract"], "employer_type": "agency"}, None),
        (11, 2, "jsearch", {"job_employment_types": ["CONTRACTOR"]}, "Contractor"),
        (12, 1, "jobspipe", {"salary_currency": "USD", "employment_statuses": ["full_time"], "employer_type": "agency"}, None),
        (13, 3, "jobspipe", {"salary_currency": "USD", "employment_statuses": ["contract"]}, None),
        (14, 4, "jobspipe", {"salary_currency": "USD", "employment_statuses": ["contract"]}, None),
        (15, 1, "jobspipe", {"salary_currency": "USD", "employment_statuses": ["contract"], "employer_type": "agency"}, None),
    ]
    j.executemany("INSERT INTO canonical_jobs VALUES (?,?,?,?,NULL,NULL,'new',?,'2026-09-01')",
                  [(a, b, c, json.dumps(d), e) for a, b, c, d, e in jobs])
    j.commit()
    p = sqlite3.connect(db / "pay_benchmarks.sqlite")
    p.executescript("""CREATE TABLE pay_observations (canonical_job_id INTEGER, occupation TEXT, job_title TEXT, state TEXT,
      city TEXT, hourly_mid REAL, pay_group TEXT, posted_as TEXT, per_diem INTEGER, plausible INTEGER, pay_from TEXT,
      posting_date TEXT, last_seen_date TEXT);""")
    p.executemany("INSERT INTO pay_observations VALUES (?,?,?,?,?,?,?,?,0,1,?,'2026-09-02','2026-10-01')", [
        (10, "Forklift Operator", "Forklift Operator", "TX", "Houston", 19.0, "Contract/Temp", "hourly", "salary fields"),
        (11, "Forklift Operator", "Forklift Operator", "TX", "Houston", 20.0, "Contract/Temp", "hourly", "description"),
        (12, "Forklift Operator", "Forklift Operator", "TX", "Houston", 21.0, "Permanent", "hourly", "salary fields"),
        (13, "Forklift Operator", "Forklift Operator", "TX", "Houston", 22.0, "Contract/Temp", "hourly", "salary fields"),
        (14, "Forklift Operator", "Forklift Operator", "TX", "Houston", 23.0, "Contract/Temp", "hourly", "salary fields"),
        (15, "Forklift Operator", "Forklift Operator", "TX", "Houston", 24.04, "Contract/Temp", "annual", "salary fields"),
    ])
    p.commit()
    j.close()
    p.close()


class EndToEnd(unittest.TestCase):
    def test_fixture_pipeline(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture_db(tmp)
            j = ex.connect(tmp)
            firms = pop.load_firms(j)
            self.assertEqual({c: f[0] for c, f in firms.items()},
                             {1: "verified", 2: "verified", 3: "unknown", 4: "conflicting"})
            got = {o["jid"]: o["reasons"] for o in pop.iter_observations(j, firms)}
            j.close()
        self.assertEqual(got[10], [])
        self.assertEqual(got[11], [])  # JSearch contract, description "$" pay
        self.assertEqual(got[12], ["no_contract_evidence"])
        self.assertEqual(got[13], ["firm_unknown"])
        self.assertEqual(got[14], ["firm_conflicting"])
        self.assertEqual(got[15], ["pay_period_annual"])


if __name__ == "__main__":
    unittest.main()
