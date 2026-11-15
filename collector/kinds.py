"""Property types: which contracts count as homes, flats, studios, villas or commercial.

"homes" (flats, studios, villas) is the default view: shops, offices, labour camps and
whole-building leases can be worth millions each and would skew a homes median.
"""
RESIDENTIAL = {"residential"}
FLATS = {"flat", "penthouse", "apartment"}
STUDIOS = {"studio"}
VILLAS = {"villa", "complex villas", "villa addendum", "arabian house", "townhouse"}
HOME_SUBS = FLATS | STUDIOS | VILLAS
COMMERCIAL_SUB = {"shop", "office", "showroom", "warehouse", "warehouse complex", "complex warehouse", "workshop",
                  "store", "kiosk", "restaurant", "clinic", "mezzanine", "parking", "hotel", "hotel apartment"}
PROPERTY_TYPES = [  # (key, label) in the order the page shows them
    ("homes", "Homes (flats, studios, villas)"), ("flat", "Flats"), ("studio", "Studios"),
    ("villa", "Villas"), ("commercial", "Commercial"), ("all", "Everything"),
]


BULK_AED_PER_SQM = 10000  # far above Dubai's dearest homes (~5k/m²/yr): the row carries a whole bulk lease


def kind(rec):
    """flat | studio | villa | commercial | other"""
    usage, sub = rec.get("usage", "").lower(), rec.get("sub_type", "").lower()
    rooms = rec.get("rooms", "").lower()
    if rec.get("prop_type", "").lower() == "land":
        return "other"
    try:
        if float(rec["annual"]) / float(rec["size_sqm"]) > BULK_AED_PER_SQM:
            return "other"  # e.g. 18 m² "flats" each carrying a 3 million AED staff-housing contract
    except (KeyError, ValueError, ZeroDivisionError):
        pass
    # A home needs evidence: residential usage, or a home sub type when usage is missing.
    # A row with neither is "other", so incomplete rows never skew the homes median.
    if usage in RESIDENTIAL or (not usage and sub in HOME_SUBS):
        if sub in STUDIOS or rooms == "studio":
            return "studio"
        if sub in VILLAS:
            return "villa"
        if sub in FLATS:
            return "flat"
    if usage == "commercial" or sub in COMMERCIAL_SUB:
        return "commercial"
    return "other"  # labour camps, staff accommodation, whole buildings, land…


def in_type(k, t):
    return t == "all" or k == t or (t == "homes" and k in ("flat", "studio", "villa"))


def is_home(rec):
    return in_type(kind(rec), "homes")

HOME_KINDS = ("flat", "studio", "villa")


def unit(rec):
    """Readable unit: "2 bed" when DLD records rooms, else the property sub type (Flat, Villa…)."""
    rooms = (rec["rooms"] or "").strip()
    if rooms.isdigit():
        return f"{rooms} bed"
    return rooms or rec["sub_type"] or rec["prop_type"] or "Unknown"
