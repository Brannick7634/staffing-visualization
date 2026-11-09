"""Regression tests for the metro areas (county-based pooling) in the signal exports.

Run: python -m unittest discover -s tests/python

ALL DATA HERE IS SYNTHETIC ("A".."F" firms with made-up pay): nothing is read from or
written to the pipeline. The Inland Empire (city-list) cases are in test_signal_regions.py.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import signal_regions as regions  # noqa: E402
import export_signal_snapshot as ex  # noqa: E402

ROLE = "warehouse-associate"


def obs(city, pay, firm, state="CA", role=ROLE):
    return (role, state, city, pay, firm)


class Registry(unittest.TestCase):
    def test_every_metro_county_exists_in_the_site_county_map(self):
        valid = {st: set(m.values()) for st, m in regions.county_map().items()}
        for slug, a in regions.AREAS.items():
            for st, counties in a["counties"].items():
                for c in counties:
                    self.assertIn(c, valid.get(st, set()), f"{slug}: {st}/{c}")

    def test_county_map_parses_and_answers(self):
        cmap = regions.county_map()
        self.assertGreater(sum(len(v) for v in cmap.values()), 40000)
        self.assertEqual(regions.county_for("CA", "Fontana"), "san bernardino")
        self.assertEqual(regions.county_for("MO", "St. Louis"), "saint louis")
        self.assertEqual(regions.county_for("TX", "Greater Houston"), "harris")
        self.assertEqual(regions.county_for("DC", "anything"), "district of columbia")
        self.assertIsNone(regions.county_for("TX", "Nowhereville"))

    def test_areas_do_not_overlap(self):
        # Overlapping counties raise at import (signal_regions._build_indexes). The Inland Empire
        # is listed by city, so check none of its cities sits in a metro's counties.
        for name in regions.INLAND_EMPIRE_NAMES:
            if name == "inland empire":
                continue
            county = regions.county_for("CA", name)
            hit = regions._COUNTY_INDEX.get(("CA", county)) if county else None
            self.assertIsNone(hit, f"{name} -> {county} -> {hit}")

    def test_listings_are_well_formed(self):
        keys = set()
        for slug, a in regions.AREAS.items():
            self.assertTrue(a["states"] and a["label"] and a["covers"], slug)
            self.assertRegex(slug, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            for st, key in regions.listings(slug):
                self.assertEqual(key, f"{st}:{slug}")
                self.assertNotIn(key, keys)
                keys.add(key)
            if a["counties"]:  # a metro is listed first under the state of its first county list
                self.assertIn(a["states"][0], a["counties"], slug)
                for st in a["states"]:
                    self.assertIn(st, a["counties"], f"{slug} listed under {st} with no county there")
        self.assertEqual(keys, set(regions.REGION_KEYS))

    def test_dump_lists_every_listing(self):
        self.assertEqual(len(regions.dump()), len(regions.REGION_KEYS))


class MetroMembership(unittest.TestCase):
    def member(self, state, city):
        return regions.member_areas(state, city, ex.city_key(city, state))

    def test_core_and_suburb_cities(self):
        for state, city, slug in [
            ("TX", "Houston", "greater-houston"), ("TX", "Katy", "greater-houston"), ("TX", "Greater Houston", "greater-houston"),
            ("TX", "Plano", "dallas-fort-worth"), ("TX", "Fort Worth", "dallas-fort-worth"),
            ("NJ", "Newark", "greater-new-york"), ("NY", "Brooklyn", "greater-new-york"), ("NY", "Yonkers", "greater-new-york"),
            ("VA", "Arlington", "greater-washington"), ("MD", "Bethesda", "greater-washington"),
            ("DC", "Washington", "greater-washington"), ("DC", "Washington DC", "greater-washington"),
            ("MO", "St. Louis", "greater-st-louis"), ("IL", "East St. Louis", "greater-st-louis"),
            ("VA", "Norfolk", "hampton-roads"), ("VA", "Richmond", "greater-richmond"),
            ("CA", "Oakland", "bay-area"), ("CA", "San Jose", "bay-area"), ("CA", "Anaheim", "greater-los-angeles"),
            ("CA", "Bakersfield", "central-valley"),
            ("CO", "Aurora", "greater-denver"), ("AZ", "Mesa", "greater-phoenix"),
            ("CA", "Fontana", "inland-empire"), ("CA", "Riverside", "inland-empire"),
        ]:
            self.assertEqual(self.member(state, city), [slug], f"{city}, {state}")

    def test_places_outside_every_area(self):
        for state, city in [("TX", "El Paso"), ("IL", "Springfield"), ("ME", "Portland"), ("NV", "Las Vegas"),
                            ("WY", "Cheyenne"), ("TX", "Nowhereville")]:
            self.assertEqual(self.member(state, city), [], f"{city}, {state}")

    def test_same_city_name_in_another_state_stays_out(self):
        self.assertEqual(self.member("OR", "Portland"), ["greater-portland"])
        self.assertEqual(self.member("ME", "Portland"), [])
        self.assertEqual(self.member("MO", "Kansas City"), ["kansas-city-area"])
        self.assertEqual(self.member("KS", "Kansas City"), ["kansas-city-area"])
        self.assertEqual(self.member("IL", "Aurora"), ["greater-chicago"])

    def test_blank_inputs(self):
        self.assertEqual(regions.member_areas("TX", "", None), [])
        self.assertEqual(regions.member_areas(None, "Houston", "TX:houston"), [])


class MetroPooling(unittest.TestCase):
    def listed(self, cells, slug, role=ROLE):
        return {c["state"]: c for c in cells if c["roleKey"] == role and c["level"] == "city" and c["city"].endswith(f":{slug}")}

    def test_cross_state_metro_has_one_identical_cell_per_listed_state(self):
        rows = [obs("Arlington", 20.0, "A", state="VA"), obs("Bethesda", 22.0, "B", state="MD"),
                obs("Washington", 24.0, "C", state="DC")]
        cells, withheld, _ = ex.pay_cells(rows)
        got = self.listed(cells, "greater-washington")
        self.assertEqual(sorted(got), ["DC", "MD", "VA"])
        for st, c in got.items():
            self.assertEqual(c["city"], f"{st}:greater-washington")
            self.assertEqual((c["typicalCents"], c["observations"]), (2200, 3))
        self.assertEqual(withheld["area"], 0)
        # one posting per state: no state-level cell can publish, the pooled area can
        self.assertEqual([c for c in cells if c["level"] == "state"], [])

    def test_two_firms_fail_in_every_listing(self):
        rows = [obs("Arlington", 20.0, "A", state="VA"), obs("Bethesda", 22.0, "B", state="MD"),
                obs("Washington", 24.0, "B", state="DC")]
        cells, withheld, cov = ex.pay_cells(rows)
        self.assertEqual(self.listed(cells, "greater-washington"), {})
        self.assertEqual(withheld["area"], 3)  # one per listing
        self.assertEqual(cov[ROLE]["cityCells"], 0)

    def test_pooled_cell_obeys_the_firm_share_cap(self):
        rows = [obs("Houston", 18.0, "A", state="TX"), obs("Katy", 18.5, "A", state="TX"), obs("Sugar Land", 19.0, "A", state="TX"),
                obs("Pasadena", 19.5, "B", state="TX"), obs("Conroe", 20.0, "C", state="TX")]
        cells, withheld, _ = ex.pay_cells(rows)  # firm A is 3 of 5 = 60%
        self.assertEqual(self.listed(cells, "greater-houston"), {})
        self.assertEqual(withheld["area"], 1)
        rows.append(obs("Humble", 21.0, "D", state="TX"))  # 3 of 6 = exactly 50%: passes
        self.assertIn("TX", self.listed(ex.pay_cells(rows)[0], "greater-houston"))

    def test_outside_cities_never_enter_a_metro(self):
        rows = [obs("Houston", 18.0, "A", state="TX"), obs("Katy", 19.0, "B", state="TX"), obs("Conroe", 20.0, "C", state="TX"),
                obs("El Paso", 90.0, "D", state="TX"), obs("Houston", 90.0, "E", state="MO")]
        cell = self.listed(ex.pay_cells(rows)[0], "greater-houston")["TX"]
        self.assertEqual((cell["observations"], cell["p75Cents"]), (3, 2000))

    def test_unmatched_county_is_left_out_not_guessed(self):
        rows = [obs("Houston", 18.0, "A", state="TX"), obs("Katy", 19.0, "B", state="TX"),
                obs("Nowhereville", 20.0, "C", state="TX")]
        self.assertEqual(self.listed(ex.pay_cells(rows)[0], "greater-houston"), {})  # only 2 placed

    def test_individual_city_cells_are_still_published(self):
        rows = [obs("Houston", 18.0 + i, f"F{i}", state="TX") for i in range(3)]
        cities = [c["city"] for c in ex.pay_cells(rows)[0] if c["level"] == "city"]
        self.assertIn("TX:houston", cities)
        self.assertIn("TX:greater-houston", cities)

    def test_a_posting_that_names_the_area_counts(self):
        rows = [obs("Twin Cities", 18.0, "A", state="MN"), obs("Minneapolis", 19.0, "B", state="MN"),
                obs("Saint Paul", 20.0, "C", state="MN")]
        self.assertEqual(sorted(self.listed(ex.pay_cells(rows)[0], "twin-cities")), ["MN", "WI"])  # the area names itself; listed in both states

    def test_area_cells_never_count_as_city_coverage_or_city_combos(self):
        rows = [obs("Houston", 18.0 + i, f"F{i}", state="TX") for i in range(3)]
        _, _, cov = ex.pay_cells(rows)
        self.assertEqual(cov[ROLE]["cityCells"], 1)  # Houston only, not the Greater Houston area

    def test_published_metro_cells_always_pass_the_real_gate(self):
        cities = ["Houston", "Katy", "Sugar Land", "Pasadena", "Conroe", "Humble", "Pearland", "Spring"]
        rows = [obs(c, 17.0 + i, f"F{i % 5}", state="TX") for i, c in enumerate(cities * 2)]
        for c in ex.pay_cells(rows)[0]:
            self.assertTrue(ex.passes(c["checks"]), c)

    def test_calc_version_is_not_bumped(self):
        self.assertEqual(ex.CALC_VERSION, "signal-agg-2.1.0")


if __name__ == "__main__":
    unittest.main()
