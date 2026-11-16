"""Dubai Data's daily JSON pages: fresher than the weekly export, all-or-nothing, polite.
The fixture is three communities exactly as datadubai.ae served them on 16 Nov 2026."""
import csv
import json
import os
from unittest import mock

from helpers import ROOT, TempData

import fetch_datadubai  # noqa: E402
import net  # noqa: E402
import store  # noqa: E402

with open(os.path.join(ROOT, "tests", "fixtures_datadubai_live.json"), encoding="utf-8") as fh:
    PAGES = json.load(fh)


class LiveTests(TempData):
    def setUp(self):
        super().setUp()
        self.write("datadubai/README.md", "# Dubai Data\n\n- **Data through:** 2026-10-29 (lag)\n")
        self.write("datadubai/rents_by_community.csv", "name,url,contracts,rent_median,yield_pct\nOld,u,1,1,1\n")
        self.write("datadubai/areas.csv", "name,slug,url\nSome Area,some-area,https://datadubai.ae/x/\n")
        self.calls, self.mirror_calls = [], []
        self.fail_on = None

    def fake_get(self, url, **kw):
        self.calls.append(url)
        path = url.replace(fetch_datadubai.LIVE, "")
        if path == self.fail_on:
            raise net.StopForToday("HTTP 503")
        return json.loads(json.dumps(PAGES[path]))

    def fake_mirror(self, url, dest, etags, key):
        self.mirror_calls.append(key)
        return "unchanged"

    def run_main(self, today="2026-11-16", env=None):
        from datetime import date
        with mock.patch.object(net, "get_json", self.fake_get), \
             mock.patch.object(fetch_datadubai, "fetch", self.fake_mirror), \
             mock.patch.object(fetch_datadubai, "MIN_COMMUNITIES", 1), \
             mock.patch.object(store, "today_dubai", return_value=date.fromisoformat(today)), \
             mock.patch.dict(os.environ, {"FORCE": "0", "DATADUBAI_LIVE": "1", **(env or {})}), \
             mock.patch("builtins.print"):
            fetch_datadubai.main(sleep=lambda s: None)

    def rows(self, name):
        with open(os.path.join(self.tmp, "datadubai", name), encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_fresh_pages_replace_the_weekly_files(self):
        self.run_main()
        self.assertEqual(fetch_datadubai.data_through(), "2026-11-13")
        rents = {r["name"]: r for r in self.rows("rents_by_community.csv")}
        self.assertEqual(set(rents), {"Jumeirah Village Circle", "Dubai Marina", "Jumeirah Park"})
        self.assertEqual(rents["Jumeirah Village Circle"]["url"], "https://datadubai.ae/communities/jumeirah-village-circle/")
        beds = [b for b in self.rows("community_bedrooms.csv") if b["community"] == "Jumeirah Village Circle"]
        self.assertEqual([b["label"] for b in beds][:2], ["Studios", "1-bedroom apartments"])
        self.assertEqual(beds[0]["rent_median"], "48000")
        top = {c["name"]: c["top_area"] for c in self.rows("communities.csv")}
        self.assertEqual(top["Jumeirah Village Circle"], "Al Barsha South Fourth")
        areas = {a["name"]: a["url"] for a in self.rows("areas.csv")}
        self.assertEqual(areas["Al Barsha South Fourth"], "https://datadubai.ae/communities/jumeirah-village-circle/")
        self.assertIn("Some Area", areas, "the export's other areas are kept")
        self.assertEqual(self.mirror_calls, ["huggingface:data/projects.csv"], "only projects.csv still comes from the export")
        self.assertEqual(len(self.calls), 4, "rents.json + one page per community")

    def test_a_failed_page_keeps_the_old_files_and_uses_the_export(self):
        self.fail_on = "/communities/dubai-marina.json"
        self.run_main()
        self.assertEqual(fetch_datadubai.data_through(), "2026-10-29")
        self.assertEqual([r["name"] for r in self.rows("rents_by_community.csv")], ["Old"])
        self.assertIn("huggingface:data/rents_by_community.csv", self.mirror_calls)
        with open(os.path.join(self.tmp, "state.json")) as f:
            self.assertEqual(json.load(f)["datadubai"]["state"], "failed")

    def test_at_most_every_six_hours_and_nothing_when_already_current(self):
        self.run_main()
        n = len(self.calls)
        self.run_main()
        self.assertEqual(len(self.calls), n, "no requests on a duplicate start minutes later")
        self.later(7)
        self.run_main()
        self.assertEqual(len(self.calls), n + 1, "7 hours later: only rents.json, since nothing newer was published")

    def test_switch_off(self):
        self.run_main(env={"DATADUBAI_LIVE": "0"})
        self.assertEqual(self.calls, [])
        self.assertIn("huggingface:data/rents_by_community.csv", self.mirror_calls)

    def test_too_few_communities_is_rejected(self):
        # run_main lowers the minimum for the 3-community fixture; here the real minimum (50) applies.
        with mock.patch.object(net, "get_json", self.fake_get), \
             mock.patch.object(fetch_datadubai, "fetch", self.fake_mirror), mock.patch("builtins.print"):
            fetch_datadubai.main(sleep=lambda s: None)
        self.assertEqual(fetch_datadubai.data_through(), "2026-10-29", "3 communities < 50: treated as broken")

    def test_suspicious_index_is_rejected(self):
        bad = dict(PAGES["/rents.json"], through="soon")
        with mock.patch.dict(PAGES, {"/rents.json": bad}):
            self.run_main()
        self.assertEqual(fetch_datadubai.data_through(), "2026-10-29")
