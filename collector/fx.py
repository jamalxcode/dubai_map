"""Exchange rates for the map's currency switch: data/fx.json, once a day.

The dirham is pegged to the US dollar (AED 3.6725 = USD 1), so USD needs no source. EUR and GBP come from the
European Central Bank's daily reference rates through Frankfurter (free, no key, https://frankfurter.dev): one
request a day. Without an answer the current file stays, and the map offers AED and USD only.

Writes {"date": "<ECB date>", "fetched": "...", "source": "...", "per_aed": {"USD": 0.2723, "EUR": ..., "GBP": ...}}.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
import store  # noqa: E402

PEG = 3.6725
URL = os.environ.get("FX_URL") or "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP"
SOURCE = "European Central Bank reference rates via Frankfurter; AED at the USD peg (3.6725)"


def build(payload, fetched):
    r = (payload or {}).get("rates") or {}
    eur, gbp = r.get("EUR"), r.get("GBP")
    if not all(isinstance(v, (int, float)) and 0.2 < v < 5 for v in (eur, gbp)):
        return None
    return {"date": payload.get("date"), "fetched": fetched, "source": SOURCE,
            "per_aed": {"USD": round(1 / PEG, 6), "EUR": round(eur / PEG, 6), "GBP": round(gbp / PEG, 6)}}


def main(get=None):
    get = get or net.get_json
    s = st.load()
    b = s.setdefault("fx", {})
    if not st.due(b, "last_ok_at", min_hours=20) and os.environ.get("FORCE") != "1":
        net.log("rates fetched in the last 20 hours", "fx")
        return 0
    try:
        out = build(get(URL, timeout=20, attempts=2, source="fx"), st.now_iso())
    except (net.StopForToday, net.AuthError) as e:
        st.set_status(b, "failed", f"{e}; the current rates stay")
        st.save(s)
        return 0
    if not out:
        st.set_status(b, "failed", "no believable rates in the answer; the current rates stay")
        st.save(s)
        return 0
    with open(os.path.join(store.DATA, "fx.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    b["last_ok_at"], b["date"] = st.now_iso(), out["date"]
    st.set_status(b, "ok")
    st.save(s)
    net.log(f"rates for {out['date']}: {out['per_aed']}", "fx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
