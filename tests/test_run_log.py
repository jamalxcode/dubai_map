"""The run log (scripts/run_log.py): one line per pull, the last 300 kept; publication times."""
import json
import os
import sys

from helpers import ROOT, TempData

sys.path.insert(0, os.path.join(ROOT, "scripts"))
import run_log  # noqa: E402


class RunLogTests(TempData):
    STATE = {"datadubai": {"state": "ok", "published_seen": [{"through": "2026-11-16", "seen_at": "2026-11-17T01:55:27+00:00"},
                                                              {"through": "2026-11-17", "seen_at": "2026-11-18T02:17:00+00:00"}]},
             "pulse": {"state": "no_key"}, "crosscheck": {"ccp": {"state": "ok"}}}

    def test_entry_and_keep_the_last_ones(self):
        e = run_log.entry(self.STATE, {"data_through": "2026-11-16", "n_areas": 158}, now=1000.0, started=900.0, event="schedule", run_id="7")
        self.assertEqual((e["seconds"], e["through"], e["areas"], e["backup"]), (100, "2026-11-16", 158, False))
        self.assertEqual(e["sources"], {"datadubai": "ok", "pulse": "no_key", "crosscheck:ccp": "ok"})
        path = os.path.join(self.tmp, "runs.jsonl")
        for i in range(5):
            run_log.append(path, {"i": i}, keep=3)
        with open(path) as f:
            self.assertEqual([json.loads(x)["i"] for x in f.read().splitlines()], [2, 3, 4])

    def test_publication_hours_in_kuwait_time(self):
        self.assertEqual(run_log.publication_hours(self.STATE), [("04:00", 1), ("05:00", 1)])

    def test_what_each_source_read(self):
        st = dict(self.STATE, datadubai=dict(self.STATE["datadubai"], last_pull={"live": "updated", "pages": 152, "export_files_updated": 1, "through": "2026-11-16"}),
                  crosscheck={"ccp": {"state": "ok", "rows": 358, "through": "2026-11-15"}}, pulse={"state": "no_key"})
        p = run_log.pulled(st)
        self.assertEqual(p["datadubai"], {"live": "updated", "pages": 152, "export_files_updated": 1, "through": "2026-11-16"})
        self.assertEqual(p["crosscheck:ccp"], {"rows": 358, "through": "2026-11-15"})
        self.assertEqual(p["pulse"], {})
