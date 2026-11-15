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


if __name__ == "__main__":
    unittest.main()
