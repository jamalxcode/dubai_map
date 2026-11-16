"""Shared test setup: make collector/ importable and redirect data paths to a temp folder."""
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "collector"))

import store  # noqa: E402


class TempData(unittest.TestCase):
    """Points store.DATA / store.CONTRACTS at a throwaway folder for each test."""

    def setUp(self):
        # Tests never reach datadubai.ae: the live-page fetch is off unless a test turns it on.
        env = mock.patch.dict(os.environ, {"DATADUBAI_LIVE": "0"})
        env.start()
        self.addCleanup(env.stop)
        self.tmp = tempfile.mkdtemp(prefix="dubai_map_test_")
        self._saved = (store.DATA, store.CONTRACTS)
        store.DATA = self.tmp
        store.CONTRACTS = os.path.join(self.tmp, "contracts")

    def tearDown(self):
        store.DATA, store.CONTRACTS = self._saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write(self, rel, text):
        path = os.path.join(self.tmp, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return path
