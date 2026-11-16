"""Contract parsing, normalising and de-duplicated storage."""
import os
import unittest

from helpers import TempData, store


def raw(**over):
    r = {"contract_id": "C1", "line_number": "1", "contract_start_date": "05-11-2026",
         "contract_end_date": "04-11-2027", "annual_amount": "65,000", "area_name_en": "Al Barsha South Fourth",
         "project_name_en": "Bloom Towers", "actual_area": "70.5"}
    r.update(over)
    return r


class ParseTests(unittest.TestCase):
    def test_dates_in_dld_formats(self):
        self.assertEqual(store.parse_date("05-11-2026"), "2026-11-05")
        self.assertEqual(store.parse_date("5/1/2026"), "2026-01-05")
        self.assertEqual(store.parse_date("2026-11-05T00:00:00"), "2026-11-05")
        self.assertEqual(store.parse_date("05 Nov 2026"), "2026-11-05")
        self.assertEqual(store.parse_date(""), "")
        self.assertEqual(store.parse_date("not a date"), "")

    def test_us_dates_and_impossible_dates(self):
        self.assertEqual(store.parse_date("11/15/2026 12:00:00 AM"), "2026-11-15", "US form with AM/PM time")
        self.assertEqual(store.parse_date("05/11/2026 12:00:00 AM"), "2026-05-11", "AM/PM means month first")
        self.assertEqual(store.parse_date("11/15/2026"), "2026-11-15", "15 can't be a month")
        self.assertEqual(store.parse_date("15/11/2026"), "2026-11-15")
        self.assertEqual(store.parse_date("31/02/2026"), "", "no 31 February")
        self.assertEqual(store.parse_date("15/15/2026"), "")
        self.assertEqual(store.parse_date("2026-15-01"), "", "no month 15 in ISO either")

    def test_numbers(self):
        self.assertEqual(store.parse_number("65,000"), 65000.0)
        self.assertEqual(store.parse_number("AED 1,200.50"), 1200.5)
        self.assertEqual(store.parse_number(""), 0.0)
        self.assertEqual(store.parse_number("abc"), 0.0)


class NormalizeTests(unittest.TestCase):
    def test_api_headers_map_to_canonical_fields(self):
        r = store.normalize(raw(), "test")
        self.assertEqual(r["key"], "C1#1")
        self.assertEqual(r["start"], "2026-11-05")
        self.assertEqual(r["annual"], "65000")
        self.assertEqual(r["size_sqm"], "70.50")
        self.assertEqual(r["area"], "Al Barsha South Fourth")
        self.assertTrue(store.valid(r))

    def test_data_dubai_room_field(self):
        r = store.normalize(raw(no_of_rooms="2"), "t")
        self.assertEqual(r["rooms"], "2")

    def test_website_export_headers_get_a_stable_hash_key(self):
        row = {"Start Date": "05-11-2026", "End Date": "04-11-2027", "Annual Amount": "65000",
               "Area": "Al Barsha South Fourth", "Project": "Bloom Towers"}
        a, b = store.normalize(row, "x"), store.normalize(dict(row), "y")
        self.assertTrue(a["key"].startswith("h:"))
        self.assertEqual(a["key"], b["key"])

    def test_invalid_without_rent_or_area(self):
        self.assertFalse(store.valid(store.normalize(raw(annual_amount="0"), "t")))
        self.assertFalse(store.valid(store.normalize(raw(area_name_en=""), "t")))


class MergeTests(TempData):
    def test_merge_dedupes_and_tracks_updates(self):
        a, u = store.merge([store.normalize(raw(), "t"), store.normalize(raw(contract_id="C2"), "t")])
        self.assertEqual((a, u), (2, 0))
        # Same rows again: nothing new.
        self.assertEqual(store.merge([store.normalize(raw(), "t")]), (0, 0))
        # A correction to an existing contract counts as an update, not a new row.
        self.assertEqual(store.merge([store.normalize(raw(annual_amount="66000"), "t")]), (0, 1))
        rows = list(store.iter_all())
        self.assertEqual(len(rows), 2)
        self.assertEqual({r["key"]: r["annual"] for r in rows}["C1#1"], "66000")
        self.assertTrue(os.path.exists(os.path.join(store.CONTRACTS, "2026-11", "05.csv.gz")))

    def test_invalid_rows_are_dropped(self):
        self.assertEqual(store.merge([store.normalize(raw(annual_amount=""), "t")]), (0, 0))
        self.assertEqual(list(store.iter_all()), [])


def pulse(cid, **over):
    """A contract as Dubai Pulse sends it: with a contract id."""
    r = {"contract_id": cid, "line_number": "1", "contract_start_date": "05-11-2026",
         "contract_end_date": "04-11-2027", "annual_amount": "65000", "area_name_en": "Al Barsha South Fourth",
         "actual_area": "70.5", "project_name_en": "Bloom Towers"}
    r.update(over)
    return store.normalize(r, "dubai_pulse_api")


def dld(reg="2026-11-05T09:00:00", **over):
    """The same contract as the DLD service sends it: no id, different headers, a registration timestamp."""
    r = {"START_DATE": "2026-11-05T00:00:00", "END_DATE": "2027-11-04T00:00:00", "ANNUAL_AMOUNT": 65000,
         "AREA_EN": "AL BARSHA SOUTH FOURTH", "ACTUAL_AREA": 70.5, "REGISTRATION_DATE": reg, "PROJECT_EN": None}
    r.update(over)
    return store.normalize(r, "dld_open_data")


class CrossSourceTests(TempData):
    """One contract reaching us from two sources (with and without an id) is stored once."""

    def keys(self):
        return sorted(r["key"] for r in store.iter_all())

    def test_id_first_then_idless_copy(self):
        self.assertEqual(store.merge([pulse("C1")]), (1, 0))
        self.assertEqual(store.merge([dld()]), (0, 0), "the id-less copy is recognised, not added")
        self.assertEqual(self.keys(), ["C1#1"])
        self.assertEqual(store.merge([dld()]), (0, 0), "and stays recognised on the next pull")
        self.assertEqual(self.keys(), ["C1#1"])

    def test_idless_first_then_id_copy_replaces_it(self):
        h = dld()["key"]
        self.assertEqual(store.merge([dld()]), (1, 0))
        self.assertEqual(store.merge([pulse("C1")]), (0, 1), "the id row replaces the hashed one")
        self.assertEqual(self.keys(), ["C1#1"])
        self.assertEqual(next(store.iter_all())["alias"], h)
        self.assertEqual(store.merge([dld()]), (0, 0), "a re-pull of the id-less copy is not re-added")
        self.assertEqual(store.merge([pulse("C1")]), (0, 0))
        self.assertEqual(self.keys(), ["C1#1"])

    def test_twin_contracts_stay_separate(self):
        """Two identical units leased the same day are two contracts in every source."""
        store.merge([pulse("C1"), pulse("C2")])
        store.merge([dld(reg="2026-11-05T09:00:00"), dld(reg="2026-11-05T09:05:00")])
        self.assertEqual(self.keys(), ["C1#1", "C2#1"])
        store.merge([dld(reg="2026-11-05T09:10:00")])  # a third twin only the DLD service has
        self.assertEqual(len(self.keys()), 3)

    def test_twins_idless_first(self):
        store.merge([dld(reg="2026-11-05T09:00:00"), dld(reg="2026-11-05T09:05:00")])
        store.merge([pulse("C1")])
        self.assertEqual(len(self.keys()), 2, "one hashed twin replaced, the other kept")
        store.merge([pulse("C2")])
        self.assertEqual(self.keys(), ["C1#1", "C2#1"])
        store.merge([dld(reg="2026-11-05T09:00:00"), dld(reg="2026-11-05T09:05:00")])
        self.assertEqual(self.keys(), ["C1#1", "C2#1"])

    def test_different_contracts_are_not_merged(self):
        store.merge([pulse("C1")])
        store.merge([dld(ANNUAL_AMOUNT=70000)])
        self.assertEqual(len(self.keys()), 2)

    def test_correction_keeps_the_pairing(self):
        store.merge([pulse("C1")])
        store.merge([dld()])
        self.assertEqual(store.merge([pulse("C1", project_name_en="Bloom Towers B")]), (0, 1))
        self.assertTrue(next(store.iter_all())["alias"].startswith("h:"), "alias survives an update")
        self.assertEqual(store.merge([dld()]), (0, 0))
        self.assertEqual(self.keys(), ["C1#1"])


if __name__ == "__main__":
    unittest.main()
