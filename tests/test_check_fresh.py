"""Freshness check rules (scripts/check_fresh.py)."""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import check_fresh as cf  # noqa: E402

NOW = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
META = {"data_through": "2026-11-13", "generated_at": "2026-11-16T08:00:00+00:00", "sources": [
    {"name": "Dubai Pulse API", "state": "no_key", "status": "no credentials"},
    {"name": "Dubai Real Estate Data (dubairealestatedata.com), cross-check", "kind": "cross-check", "state": "ok", "matched": 13, "agree": 9},
    {"name": "Continental Club Property (continentalclub.ae), cross-check", "kind": "cross-check", "state": "ok", "matched": 95, "agree": 83},
]}
RUN = {"conclusion": "success", "created_at": "2026-11-16T10:17:00Z", "html_url": "https://x/run"}
SITE = {"generated_at": "2026-11-16T08:00:00+00:00"}


class RuleTests(unittest.TestCase):
    def test_healthy(self):
        self.assertEqual(cf.problems(META, SITE, RUN, NOW), [])

    def test_stale_data(self):
        p = cf.problems(dict(META, data_through="2026-11-01"), SITE, RUN, NOW)
        self.assertEqual(len(p), 1)
        self.assertIn("15 days old", p[0])

    def test_pull_stopped_or_failed(self):
        self.assertIn("cron-job.org", cf.problems(META, SITE, dict(RUN, created_at="2026-11-15T12:00:00Z"), NOW)[0])
        self.assertIn("'failure'", cf.problems(META, SITE, dict(RUN, conclusion="failure"), NOW)[0])
        self.assertIn("No completed run", cf.problems(META, SITE, None, NOW)[0])

    def test_site_behind_or_down(self):
        self.assertIn("a deploy failed", cf.problems(META, {"generated_at": "2026-11-15T20:00:00+00:00"}, RUN, NOW)[0])
        self.assertEqual(cf.problems(META, {"generated_at": "2026-11-16T07:00:00+00:00"}, RUN, NOW), [], "an hour's lag is fine")
        self.assertIn("could not be read", cf.problems(META, "HTTP Error 404", RUN, NOW)[0])

    def test_sources(self):
        bad = dict(META, sources=[{"name": "Dubai Pulse API", "state": "failed", "status": "stopped: HTTP 403"}])
        self.assertIn("Dubai Pulse API is failing", cf.problems(bad, SITE, RUN, NOW)[0])
        off = dict(META, sources=[{"name": "DLD open-data service", "state": "off"}])
        self.assertEqual(cf.problems(off, SITE, RUN, NOW), [], "switched off on purpose is not a problem")

    def test_crosscheck_agreement_floor(self):
        s = [dict(META["sources"][1], agree=4), META["sources"][2]]
        p = cf.problems(dict(META, sources=s), SITE, RUN, NOW)
        self.assertEqual(len(p), 1)
        self.assertIn("only 4 of 13", p[0])
        few = [dict(META["sources"][1], matched=3, agree=0)]
        self.assertEqual(cf.problems(dict(META, sources=few), SITE, RUN, NOW), [], "too few matches to judge")

    def test_unplaced_area(self):
        meta = dict(META, unmatched_areas=[{"area": "Al Twar Fifth", "n": 2480}, {"area": "Al Aryam", "n": 169}])
        p = cf.problems(meta, SITE, RUN, NOW)
        self.assertEqual(len(p), 1, "only busy areas count")
        self.assertIn("Al Twar Fifth (2,480 contracts) is not on the map", p[0])

    def test_todays_real_meta_passes(self):
        import json
        path = os.path.join(cf.ROOT, "data", "meta.json")
        if not os.path.exists(path):
            self.skipTest("data/meta.json not loaded")
        meta = json.load(open(path))
        meta.pop("unmatched_areas", None)  # an unplaced area is the data's state, covered by test_unplaced_area
        live = {"generated_at": meta["generated_at"]}
        today = datetime.fromisoformat(meta["data_through"] + "T12:00:00+00:00")
        run = dict(RUN, created_at=today.isoformat())
        self.assertEqual(cf.problems(meta, live, run, today), [])


if __name__ == "__main__":
    unittest.main()
