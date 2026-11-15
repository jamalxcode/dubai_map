"""The main source (DLD open data): politeness rules, back-fill, failures and fallbacks."""
import json
import os
import unittest
from datetime import date
from unittest import mock

from helpers import TempData, store

import fetch_datadubai  # noqa: E402
import fetch_dld  # noqa: E402
import fetch_ejari  # noqa: E402

TODAY = date(2026, 3, 10)


def row(day, rent=60000, area="Al Barsha South Fourth", sub="Flat"):
    return {"CONTRACT_NUMBER": None, "VERSION_EN": "New", "REGISTRATION_DATE": f"{day}T09:00:00",
            "START_DATE": f"{day}T00:00:00", "END_DATE": "2027-01-01T00:00:00", "AREA_EN": area,
            "ANNUAL_AMOUNT": rent, "CONTRACT_AMOUNT": rent, "ACTUAL_AREA": 70, "PROP_TYPE_EN": "Unit",
            "PROP_SUB_TYPE_EN": sub, "USAGE_EN": "Residential", "IS_FREE_HOLD": 1, "PROJECT_EN": None,
            "MASTER_PROJECT_EN": None, "ROOMS": None}


class FakeService:
    """Answers like gateway.dubailand.gov.ae/open-data/rents: rows for a date range, paged, with TOTAL."""

    def __init__(self, rows, fail=False):
        self.rows, self.fail, self.calls = rows, fail, []

    def post(self, client, cmd, p):
        if client.pages >= client.max_pages:
            raise fetch_dld.PageCap()
        client.pages += 1
        self.calls.append(p)
        if self.fail:
            raise fetch_dld.StopForToday("HTTP 503")
        m, d, y = p["P_FROM_DATE"].split("/")
        frm = f"{y}-{m}-{d}"
        m, d, y = p["P_TO_DATE"].split("/")
        to = f"{y}-{m}-{d}"
        hit = [r for r in self.rows if frm <= r["START_DATE"][:10] <= to]
        skip, take = int(p["P_SKIP"]), int(p["P_TAKE"])
        return [dict(r, TOTAL=len(hit)) for r in hit[skip:skip + take]]


class DldTests(TempData):
    def run_day(self, svc, today=TODAY, env=None, max_pages=70):
        client = fetch_dld.Client(max_pages=max_pages, pause=0, sleep=lambda s: None)
        client.post = lambda cmd, p: svc.post(client, cmd, p)
        with mock.patch.object(store, "today_dubai", return_value=today), \
             mock.patch.object(fetch_dld, "Client", return_value=client), \
             mock.patch.dict(os.environ, {"DLD_ENABLED": "1", "DLD_DISABLED": "", "FORCE": "0", **(env or {})}), \
             mock.patch("builtins.print"):
            fetch_dld.main()
        with open(os.path.join(self.tmp, "state.json")) as f:
            return json.load(f)["dld"]

    def test_backfills_one_month_per_day_newest_first_then_stops(self):
        rows = [row(f"2026-{m:02d}-{d:02d}") for m in (1, 2, 3) for d in (2, 9, 20)]
        svc = FakeService(rows)
        st = self.run_day(svc)
        self.assertEqual((st["state"], st["status"]), ("ok", "ok"))
        self.assertEqual(st["months_done"], ["2026-03"])
        self.assertFalse(st["backfill_complete"])
        days = [TODAY.replace(day=11), TODAY.replace(day=12)]
        for d in days:
            st = self.run_day(svc, today=d)
        self.assertEqual(st["months_done"], ["2026-01", "2026-02", "2026-03"])
        self.assertTrue(st["backfill_complete"])
        self.assertEqual(len(list(store.iter_all())), len(rows))

    def test_once_per_day_and_force(self):
        svc = FakeService([row("2026-03-09")])
        self.run_day(svc)
        n = len(svc.calls)
        self.run_day(svc)
        self.assertEqual(len(svc.calls), n, "a second run the same day must not contact DLD")
        self.run_day(svc, env={"FORCE": "1"})
        self.assertGreater(len(svc.calls), n)

    def test_page_cap_stops_politely_and_resumes_tomorrow(self):
        svc = FakeService([row("2026-03-09")])
        st = self.run_day(svc, max_pages=1)
        self.assertEqual(st["state"], "partial")
        self.assertTrue(st["status"].startswith("ok (page cap"))
        self.assertEqual(st["pages"], 1)

    def test_failure_is_recorded_and_backup_api_takes_over(self):
        svc = FakeService([], fail=True)
        st = self.run_day(svc)
        self.assertEqual((st["state"], st["status"]), ("failed", "stopped: HTTP 503"))
        self.assertEqual(len(svc.calls), 1, "no hammering after a failure")
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        with mock.patch.object(store, "today_dubai", return_value=TODAY), mock.patch.dict(os.environ, keys), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], "ok", "")) as api, mock.patch("builtins.print"):
            fetch_ejari.main()
        api.assert_called_once()

    def test_backup_api_stays_idle_when_main_source_worked(self):
        self.run_day(FakeService([row("2026-03-09")]))
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        with mock.patch.object(store, "today_dubai", return_value=TODAY), mock.patch.dict(os.environ, keys), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], "ok", "")) as api, mock.patch("builtins.print"):
            fetch_ejari.main()
        api.assert_not_called()

    def test_off_unless_enabled_and_emergency_stop(self):
        svc = FakeService([row("2026-03-09")])
        st = self.run_day(svc, env={"DLD_ENABLED": ""})
        self.assertEqual(st["state"], "off", "off by default: needs DLD's written permission")
        st = self.run_day(svc, env={"DLD_DISABLED": "1"})
        self.assertEqual(st["state"], "off")
        self.assertEqual(svc.calls, [])


class HelperTests(unittest.TestCase):
    def test_month_windows_cover_every_day_once(self):
        wins = fetch_dld.windows(date(2026, 2, 1))
        days = sum((b - a).days + 1 for a, b in wins)
        self.assertEqual(days, 28)
        self.assertEqual(wins[0][0], date(2026, 2, 1))
        self.assertEqual(wins[-1][1], date(2026, 2, 28))

    def test_payload_uses_us_dates(self):
        p = fetch_dld.payload(date(2026, 3, 1), date(2026, 3, 9), 2000, 4000)
        self.assertEqual((p["P_FROM_DATE"], p["P_TO_DATE"], p["P_SKIP"]), ("03/01/2026", "03/09/2026", "4000"))

    def test_real_dld_row_normalises(self):
        r = store.normalize(row("2026-03-09", rent=75000), "dld_open_data")
        self.assertEqual((r["start"], r["annual"], r["area"], r["sub_type"], r["reg_date"]),
                         ("2026-03-09", "75000", "Al Barsha South Fourth", "Flat", "2026-03-09"))
        self.assertTrue(r["key"].startswith("h:"))


class MirrorTests(TempData):
    def test_dubai_data_falls_back_to_github_when_hugging_face_fails(self):
        out = os.path.join(self.tmp, "datadubai")
        tried = []

        def fake(url, dest, etags, key):
            tried.append(key.split(":")[0])
            if key.startswith("huggingface"):
                return "HTTP 503"
            with open(dest, "w") as f:
                f.write("x")
            return "updated"

        with mock.patch.object(fetch_datadubai, "fetch", side_effect=fake), mock.patch("builtins.print"):
            fetch_datadubai.main()
        self.assertEqual(tried[:2], ["huggingface", "github"])
        self.assertTrue(os.path.exists(os.path.join(out, "rents_by_community.csv")))


if __name__ == "__main__":
    unittest.main()
