"""DSE (Dhaka Stock Exchange) data client.

Fetches live market data from the public dsebd.org JSON endpoints and
merges the two main sources (price board + company directory) into a
single normalized dataset. All results are cached in-memory with a
short TTL so we don't hammer the exchange on every request.
"""

import datetime
import threading
import time

import requests
import urllib3

urllib3.disable_warnings()

BASE = "https://www.dsebd.org"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "application/json,text/html,*/*;q=0.8",
}

_cache = {}
_lock = threading.Lock()


def _num(x):
    """Coerce a value to float, returning None for empty/garbage."""
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace(",", "").replace("%", "").strip()
    if s in ("", "-", "n/a", "N/A", "--", "None", "null"):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _get(url, params=None, timeout=40, retries=3):
    last = None
    for _ in range(retries):
        try:
            r = requests.get(url, params=params, timeout=timeout, verify=False, headers=HEADERS)
            if r.status_code == 200:
                return r
            last = r
        except requests.RequestException as e:
            last = e
        time.sleep(0.6)
    raise RuntimeError(f"Failed to fetch {url}: {last}")


def _json(url, params=None):
    return _get(url, params=params).json()


def _cached(key, ttl, fn):
    """Simple TTL cache. fn is only called on a miss."""
    now = time.time()
    with _lock:
        item = _cache.get(key)
        if item and (now - item[0]) < ttl:
            return item[1]
    data = fn()
    with _lock:
        _cache[key] = (time.time(), data)
    return data


def _fetch_raw_prices():
    d = _json(f"{BASE}/api/live/prices")
    cols = d.get("cols", [])
    idx = {c: i for i, c in enumerate(cols)}
    out = []
    for r in d.get("rows", []):
        out.append({c: r[idx[c]] for c in cols})
    return out


def _fetch_companies():
    d = _json(f"{BASE}/api/live/companies", params={"pageSize": 1000})
    return d.get("rows", [])


def get_prices():
    """Merged price board: OHLC + volume/value + name/sector/fundamentals."""

    def build():
        raw = _fetch_raw_prices()
        comp = {c.get("code"): c for c in _fetch_companies()}
        rows = []
        for r in raw:
            code = r.get("code")
            c = comp.get(code, {})
            rows.append({
                "code": code,
                "name": c.get("name") or code,
                "sector": r.get("sector") or c.get("sector"),
                "category": r.get("category") or c.get("category"),
                "assetType": r.get("assetType"),
                "board": c.get("board"),
                "ltp": _num(r.get("ltp")),
                "ycp": _num(r.get("ycp")),
                "open": _num(r.get("open")),
                "high": _num(r.get("high")),
                "low": _num(r.get("low")),
                "close": _num(r.get("close")),
                "percent": _num(r.get("percent")),
                "volume": _num(r.get("volume")),
                "value": _num(r.get("value")),
                "trades": _num(r.get("trades")),
                "marketCap": _num(c.get("marketCap")),
                "pe": _num(c.get("pe")),
                "dividendYield": _num(c.get("dividendYield")),
            })
        return rows

    return _cached("prices", 30, build)


def get_snapshot():
    """Market indices, totals, breadth and session state."""
    return _cached("snapshot", 30, lambda: _json(f"{BASE}/api/live/snapshot"))


def get_history(code, days=180):
    """Day-end OHLC history for a single instrument (oldest -> newest)."""
    days = max(7, min(int(days), 730))
    today = datetime.date.today()
    frm = (today - datetime.timedelta(days=days)).isoformat()
    to = today.isoformat()
    key = f"hist:{code}:{days}"

    def build():
        d = _json(
            f"{BASE}/api/live/data-archive/day-end",
            params={"from": frm, "to": to, "inst": code},
        )
        rows = sorted(d.get("rows", []), key=lambda x: x.get("date", ""))
        return [
            {
                "date": x.get("date"),
                "open": _num(x.get("openp")),
                "high": _num(x.get("high")),
                "low": _num(x.get("low")),
                "close": _num(x.get("closep")),
                "volume": _num(x.get("volume")),
                "value": _num(x.get("value")),
                "trades": _num(x.get("trade")),
                "ycp": _num(x.get("ycp")),
            }
            for x in rows
        ]

    return _cached(key, 3600, build)


def get_news(limit=100, q=None, code=None):
    """Market news / disclosures (optionally filtered by text or code)."""
    limit = max(1, min(int(limit), 500))
    key = f"news:{code or ''}:{q or ''}:{limit}"

    def build():
        params = {}
        if code:
            params["code"] = code.upper()
        if q:
            params["q"] = q
        d = _json(f"{BASE}/api/live/news", params=params or None)
        return d.get("rows", [])[:limit]

    return _cached(key, 300, build)


def get_search(q):
    """Company search by code or name."""
    q = (q or "").strip()
    if not q:
        return []

    def build():
        return _json(f"{BASE}/api/live/companies/search", params={"q": q}).get("rows", [])

    return _cached(f"search:{q}", 3600, build)


def get_sectors():
    """Aggregate the price board by sector."""

    def build():
        secs = {}
        for r in get_prices():
            sec = r.get("sector") or "Other"
            d = secs.setdefault(sec, {
                "sector": sec,
                "companies": 0,
                "traded": 0,
                "adv": 0,
                "dec": 0,
                "unch": 0,
                "volume": 0.0,
                "value": 0.0,
                "marketCap": 0.0,
                "chgSum": 0.0,
            })
            d["companies"] += 1
            ltp = r.get("ltp")
            chg = r.get("percent")
            if ltp is not None and ltp > 0:
                d["traded"] += 1
                if chg is not None:
                    d["chgSum"] += chg
                    if chg > 0:
                        d["adv"] += 1
                    elif chg < 0:
                        d["dec"] += 1
                    else:
                        d["unch"] += 1
            if r.get("volume"):
                d["volume"] += r["volume"]
            if r.get("value"):
                d["value"] += r["value"]
            if r.get("marketCap"):
                d["marketCap"] += r["marketCap"]

        out = []
        for s in secs.values():
            s["avgChange"] = round(s["chgSum"] / s["traded"], 2) if s["traded"] else None
            out.append(s)
        out.sort(key=lambda x: x["value"], reverse=True)
        return out

    return _cached("sectors", 60, build)
