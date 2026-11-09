"""Regression tests for area pooling (Inland Empire) in the signal exports.

Run: python -m unittest discover -s tests/python

ALL DATA HERE IS SYNTHETIC ("Firm A".."Firm F" with made-up pay): nothing is read
from or written to the pipeline.
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import signal_regions as regions  # noqa: E402
import export_signal_snapshot as ex  # noqa: E402

KEY = regions.INLAND_EMPIRE_KEY
ROLE = "warehouse-associate"


def obs(city, pay, firm, state="CA", role=ROLE):
    return (role, state, city, pay, firm)


def area_cell(cells, role=ROLE):
    return next((c for c in cells if c["roleKey"] == role and c["city"] == KEY), None)


class Membership(unittest.TestCase):
    def test_key_is_stable(self):
        # The site picker entry is checked against the registry in tests/signal/areas.test.mjs.
        self.assertEqual(KEY, "CA:inland-empire")
        self.assertIn(KEY, regions.REGION_KEYS)

    def test_every_member_slug_agrees_with_the_exports_city_key(self):
        for name in regions.INLAND_EMPIRE_NAMES:
            self.assertEqual(ex.city_key(name.title(), "CA"), f"CA:{regions._slug(name)}", name)

    def test_core_cities_are_members(self):
        for city in ("Fontana", "Ontario", "Chino", "Riverside", "Corona", "Temecula", "Rialto", "Redlands", "Perris",
                     "Rancho Cucamonga", "San Bernardino", "Jurupa Valley", "Moreno Valley", "Victorville",
                     "Hesperia", "Palm Springs", "Rancho Mirage"):
            self.assertEqual(regions.region_for(ex.city_key(city, "CA")), KEY, city)

    def test_name_decoration_is_ignored(self):
        for city in ("City of Fontana", "Greater Riverside", "Riverside County", "San Bernardino County",
                     "Inland Empire", "Inland Empire Area", "FONTANA"):
            self.assertEqual(regions.region_for(ex.city_key(city, "CA")), KEY, city)

    def test_other_places_are_not_members(self):
        for city, st in (("Los Angeles", "CA"), ("Sacramento", "CA"), ("San Diego", "CA"), ("Irvine", "CA"),
                         ("Long Beach", "CA"), ("Anaheim", "CA")):
            self.assertIsNone(regions.region_for(ex.city_key(city, st)), city)

    def test_same_named_city_in_another_state_is_not_a_member(self):
        # Sun City, AZ and Ontario, OR share names with Inland Empire places.
        self.assertIsNone(regions.region_for(ex.city_key("Sun City", "AZ")))
        self.assertIsNone(regions.region_for(ex.city_key("Ontario", "OR")))
        self.assertIsNone(regions.region_for(ex.city_key("Riverside", "IA")))

    def test_blank_city_is_not_a_member(self):
        self.assertIsNone(regions.region_for(None))
        self.assertIsNone(regions.region_for(ex.city_key("Remote", "CA")))


class Pooling(unittest.TestCase):
    def test_member_cities_pool_into_one_area_cell(self):
        # Three cities, one posting each: no single city could publish, the area can.
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "C")]
        cells, withheld, _ = ex.pay_cells(rows)
        cell = area_cell(cells)
        self.assertIsNotNone(cell)
        self.assertEqual((cell["level"], cell["state"], cell["city"]), ("city", "CA", KEY))
        self.assertEqual(cell["observations"], 3)
        self.assertEqual(cell["typicalCents"], 1900)
        self.assertEqual(cell["checks"], {"status": "verified", "distinctFirms": 3, "maxFirmShare": 0.3333})
        self.assertEqual([c for c in cells if c["level"] == "city" and c["city"] != KEY], [])
        self.assertEqual(withheld["area"], 0)

    def test_individual_city_cells_are_kept(self):
        rows = [obs("Fontana", 18.0 + i, f"F{i}") for i in range(3)] + [obs("Riverside", 19.0, "Z")]
        cells, _, _ = ex.pay_cells(rows)
        self.assertEqual(sorted(c["city"] for c in cells if c["level"] == "city"), ["CA:fontana", KEY])
        self.assertEqual(area_cell(cells)["observations"], 4)

    def test_state_and_national_cells_are_unchanged_by_pooling(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "C"),
                obs("Los Angeles", 22.0, "D")]
        cells, _, _ = ex.pay_cells(rows)
        state = next(c for c in cells if c["level"] == "state")
        self.assertEqual(state["observations"], 4)
        self.assertEqual(next(c for c in cells if c["level"] == "nationwide")["observations"], 4)
        self.assertNotIn("CA:los-angeles", [c["city"] for c in cells])

    def test_non_members_and_other_states_never_enter_the_area(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "C"),
                obs("Los Angeles", 40.0, "D"), obs("Sun City", 40.0, "E", state="AZ"),
                obs("Ontario", 40.0, "F", state="OR")]
        cell = area_cell(ex.pay_cells(rows)[0])
        self.assertEqual(cell["observations"], 3)
        self.assertEqual((cell["typicalCents"], cell["p75Cents"]), (1900, 2000))  # 40.00 never enters

    def test_other_roles_pool_separately(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "C"),
                obs("Fontana", 30.0, "A", role="forklift-operator")]
        cells, withheld, _ = ex.pay_cells(rows)
        self.assertIsNotNone(area_cell(cells))
        self.assertIsNone(area_cell(cells, role="forklift-operator"))
        self.assertEqual(withheld["area"], 1)

    def test_a_posting_that_names_the_region_counts_once(self):
        rows = [obs("Inland Empire", 18.0, "A"), obs("Fontana", 19.0, "B"), obs("Ontario", 20.0, "C")]
        cell = area_cell(ex.pay_cells(rows)[0])
        self.assertEqual(cell["observations"], 3)


class Gate(unittest.TestCase):
    """Pooling widens the postings a cell may use; it never loosens the privacy rule."""

    def test_two_firms_are_withheld_and_counted_as_area(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "B")]
        cells, withheld, cov = ex.pay_cells(rows)
        self.assertIsNone(area_cell(cells))
        self.assertEqual(withheld["area"], 1)
        # The area is reported apart from cities in coverage numbers: the 5 withheld
        # cells here are national + state + the 3 member cities, not the area.
        self.assertEqual(cov[ROLE]["cityCells"], 0)
        self.assertEqual(cov[ROLE]["withheldCells"], 5)

    def test_one_firm_over_half_is_withheld(self):
        # 4 distinct firms but firm A posts 3 of 5 (60%).
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 18.5, "A"), obs("Ontario", 19.0, "A"),
                obs("Corona", 19.5, "B"), obs("Rialto", 20.0, "C"), obs("Chino", 21.0, "D")]
        # 6 observations, firm A 3/6 = exactly 50%: passes (rule is "<= 50%").
        self.assertIsNotNone(area_cell(ex.pay_cells(rows)[0]))
        rows.pop()  # 5 observations, firm A 3/5 = 60%: fails.
        cells, withheld, _ = ex.pay_cells(rows)
        self.assertIsNone(area_cell(cells))
        self.assertEqual(withheld["area"], 1)

    def test_unverified_firm_in_the_pool_fails_closed(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, None)]
        cells, withheld, _ = ex.pay_cells(rows)
        self.assertIsNone(area_cell(cells))
        self.assertEqual(withheld["area"], 1)

    def test_published_area_cells_always_pass_the_real_gate(self):
        rows = [obs(c, 17.0 + i, f"F{i % 5}") for i, c in
                enumerate(["Fontana", "Riverside", "Ontario", "Corona", "Rialto", "Chino", "Perris", "Redlands"] * 2)]
        for c in ex.pay_cells(rows)[0]:
            self.assertTrue(ex.passes(c["checks"]), c)

    def test_no_firm_identity_leaves_the_export(self):
        rows = [obs("Fontana", 18.0, "Acme Staffing"), obs("Riverside", 19.0, "Beta Staffing"),
                obs("Ontario", 20.0, "Gamma Staffing")]
        text = repr(ex.pay_cells(rows)[0])
        for name in ("Acme", "Beta", "Gamma"):
            self.assertNotIn(name, text)


class Housekeeping(unittest.TestCase):
    def test_calc_version_is_not_bumped(self):
        # report.js refuses to compare months across a baseCalcVersion change; the
        # area adds cells without changing any existing one, so the version stays.
        self.assertEqual(ex.CALC_VERSION, "signal-agg-2.1.0")

    def test_area_cell_shape_matches_city_cells(self):
        rows = [obs("Fontana", 18.0, "A"), obs("Riverside", 19.0, "B"), obs("Ontario", 20.0, "C")]
        cell = area_cell(ex.pay_cells(rows)[0])
        self.assertEqual(sorted(cell), sorted(["roleKey", "level", "state", "city", "p25Cents", "typicalCents",
                                               "p75Cents", "payBasis", "currency", "observations", "checks"]))
        self.assertRegex(cell["city"], r"^[A-Z]{2}:[a-z0-9-]+$")
        self.assertTrue(re.match(r"^CA:", cell["city"]))


if __name__ == "__main__":
    unittest.main()
