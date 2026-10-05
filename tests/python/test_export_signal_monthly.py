"""Run: python -m unittest discover -s tests/python"""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import export_signal_monthly as m  # noqa: E402

D = dt.date.fromisoformat


class Reliability(unittest.TestCase):
    def test_rules(self):
        start, built = D("2026-08-03"), D("2026-10-02")
        self.assertTrue(m.reliability("2026-08", D("2026-10-04"), start, built)[0])
        self.assertTrue(m.reliability("2026-09", D("2026-10-04"), start, built)[0])
        ok, why = m.reliability("2026-07", D("2026-10-04"), start, built)
        self.assertFalse(ok)
        self.assertIn("collection began", why)
        self.assertFalse(m.reliability("2026-10", D("2026-10-04"), start, built)[0])
        self.assertFalse(m.reliability("2026-09", D("2026-10-04"), start, D("2026-09-28"))[0])

    def test_months(self):
        self.assertEqual(m.previous_month(D("2026-01-05")), "2025-12")
        self.assertEqual(m.month_bounds("2024-02"), (D("2024-02-01"), D("2024-02-29")))


if __name__ == "__main__":
    unittest.main()
