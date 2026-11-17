"""Our own rent history (collector/history.py): snapshots, change over time, unconfirmed jumps, what changed."""
import json
import os

from helpers import TempData

import history  # noqa: E402


def area(label, median, n=500, units=None, source=None):
    return {"label": label, "median": median, "n": n, "source": source,
            "by_unit": [{"u": u, "median": m, "n": k} for u, m, k in (units or [])]}


class HistoryTests(TempData):
    def snap(self, through, areas):
        history.save(history.snapshot(areas, through))

    def test_snapshot_keeps_medians_and_leaves_out_older_districts(self):
        s = history.snapshot([area("JVC", 66000, units=[("Studios", 48000, 7000)]), area("Karama", 50000, source="ccp")], "2026-11-16")
        self.assertEqual(s, {"through": "2026-11-16", "areas": {"JVC": {"m": 66000, "n": 500, "u": {"Studios": [48000, 7000]}}}})
        history.save(s)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "history", "2026-11-16.json")))
        self.assertEqual(history.load_all()[0]["through"], "2026-11-16")

    def test_change_needs_four_weeks_and_prefers_a_year_back(self):
        self.snap("2025-11-14", [area("JVC", 60000)])
        self.snap("2026-10-01", [area("JVC", 64000)])
        self.snap("2026-11-09", [area("JVC", 65000)])
        now = [area("JVC", 66000, units=[("Studios", 48000, 7000)])]
        history.annotate(now, history.load_all(), "2026-11-16")
        self.assertEqual(now[0]["rent_change"], {"since": "2025-11-14", "pct": 10.0}, "about a year back when there is one")
        now = [area("JVC", 66000)]
        history.annotate(now, [s for s in history.load_all() if s["through"] > "2026"], "2026-11-16")
        self.assertEqual(now[0]["rent_change"]["since"], "2026-10-01", "else the oldest at least four weeks back")
        now = [area("JVC", 66000)]
        history.annotate(now, [s for s in history.load_all() if s["through"] > "2026-11"], "2026-11-16")
        self.assertNotIn("rent_change", now[0], "a week of history shows no change")

    def test_a_big_jump_is_unconfirmed_until_the_next_publication_agrees(self):
        self.snap("2026-11-09", [area("Arjan", 60000, units=[("Studios", 40000, 300), ("5-bedroom apartments", 200000, 5)])])
        now = [area("Arjan", 90000, units=[("Studios", 41000, 300), ("5-bedroom apartments", 400000, 5)])]
        history.annotate(now, history.load_all(), "2026-11-16")
        self.assertEqual(now[0]["unconfirmed"], {"from": 60000, "pct": 50.0})
        self.assertNotIn("unconfirmed", now[0]["by_unit"][0], "a small move is fine")
        self.assertNotIn("unconfirmed", now[0]["by_unit"][1], "too few contracts to judge")
        self.snap("2026-11-16", now)
        later = [area("Arjan", 88000)]
        history.annotate(later, history.load_all(), "2026-11-23")
        self.assertNotIn("unconfirmed", later[0], "the next publication stayed close: confirmed")

    def test_changes_since_the_previous_publication(self):
        self.snap("2026-11-09", [area("JVC", 60000), area("Arjan", 60000), area("Gone", 50000)])
        now = [area("JVC", 66000), area("Arjan", 90000), area("New", 70000)]
        ch = history.changes(now, history.load_all(), "2026-11-16")
        self.assertEqual(ch["previous"], "2026-11-09")
        self.assertEqual([(r["area"], r["pct"]) for r in ch["moved"]], [("JVC", 10.0)])
        self.assertEqual([r["area"] for r in ch["unconfirmed"]], ["Arjan"])
        self.assertEqual((ch["new_areas"], ch["gone_areas"], ch["up"]), (["New"], ["Gone"], 1))
        md = history.summary_markdown(ch, {"JVC": [{"source": "Dubai Real Estate Data", "unit": "studios to 2 beds", "theirs": 50000, "pct": 20.0}]})
        self.assertIn("| Arjan | all homes | 60,000 | 90,000 | +50.0% |", md)
        self.assertIn("Sources differ", md)

    def test_no_history_yet(self):
        ch = history.changes([area("JVC", 66000)], [], "2026-11-16")
        self.assertIsNone(ch["previous"])
        self.assertIn("nothing to compare", history.summary_markdown(ch))
