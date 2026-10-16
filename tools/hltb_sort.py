"""
Sort a Steam collection by HowLongToBeat "Main + Extras" time.

Setup (once):
    pip install howlongtobeatpy

Usage:
    python hltb_sort.py --list                       # show your Steam collections
    python hltb_sort.py "My Collection"              # fetch + sort that collection
    python hltb_sort.py --names games.txt            # or: one game name per line
Options:
    --steam-dir "D:\\Steam"   if Steam isn't in C:\\Program Files (x86)\\Steam
    --batch 25               games per batch (progress is saved after each batch)
    --concurrency 3          parallel HLTB requests inside a batch

Re-running resumes: results are cached in hltb_cache.json next to this script.
Output: hltb_<collection>.csv, sorted shortest -> longest, unmatched games at the bottom.
"""
import argparse
import asyncio
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
CACHE_FILE = HERE / "hltb_cache.json"
DEFAULT_STEAM_DIRS = [
    Path(r"C:\Program Files (x86)\Steam"),
    Path(r"C:\Program Files\Steam"),
    Path.home() / ".steam" / "steam",
    Path.home() / "Library" / "Application Support" / "Steam",
]
UA = {"User-Agent": "Mozilla/5.0 (hltb-sort script)"}


# ---------------------------------------------------------------- cache
def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {"names": {}, "hltb": {}}


def save_cache(cache):
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, indent=1, ensure_ascii=False), encoding="utf-8")
    tmp.replace(CACHE_FILE)


# ---------------------------------------------------------------- steam collections
def find_steam_dir(override):
    if override:
        return Path(override)
    for d in DEFAULT_STEAM_DIRS:
        if (d / "userdata").exists():
            return d
    sys.exit("Couldn't find Steam. Pass --steam-dir \"<path to Steam folder>\".")


def read_collections(steam_dir):
    """Return list of (name, appids, is_dynamic) across all Steam accounts on this PC."""
    out = []
    for f in (steam_dir / "userdata").glob("*/config/cloudstorage/cloud-storage-namespace-1.json"):
        data = json.loads(f.read_text(encoding="utf-8"))
        for key, entry in data:
            if not key.startswith("user-collections.") or entry.get("is_deleted"):
                continue
            try:
                val = json.loads(entry.get("value", "{}"))
            except json.JSONDecodeError:
                continue
            name = val.get("name") or key.split(".", 1)[1]
            removed = set(val.get("removed", []))
            ids = [a for a in val.get("added", []) if a not in removed]
            out.append((name, ids, "filterSpec" in val))
    return out


# ---------------------------------------------------------------- steam app names
def http_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt == retries - 1:
                print(f"   ! request failed: {e}")
                return None
            time.sleep(3 * (attempt + 1))


def resolve_names(appids, cache):
    missing = [a for a in appids if str(a) not in cache["names"]]
    if not missing:
        return
    print(f"Looking up {len(missing)} game names on Steam...")
    # Bulk endpoint, 50 at a time
    for i in range(0, len(missing), 50):
        chunk = missing[i:i + 50]
        payload = {
            "ids": [{"appid": a} for a in chunk],
            "context": {"language": "english", "country_code": "US"},
            "data_request": {},
        }
        url = ("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json="
               + urllib.parse.quote(json.dumps(payload)))
        data = http_json(url) or {}
        for item in data.get("response", {}).get("store_items", []):
            if item.get("name"):
                cache["names"][str(item["appid"])] = item["name"]
        save_cache(cache)
        time.sleep(1)
    # Fallback, one at a time (rate-limited by Steam, so go slow)
    still = [a for a in missing if str(a) not in cache["names"]]
    for n, a in enumerate(still, 1):
        print(f"   fallback name lookup {n}/{len(still)}: {a}")
        data = http_json(f"https://store.steampowered.com/api/appdetails?appids={a}&filters=basic") or {}
        info = data.get(str(a), {})
        if info.get("success"):
            cache["names"][str(a)] = info["data"]["name"]
        save_cache(cache)
        time.sleep(1.6)


# ---------------------------------------------------------------- HLTB
def clean(name):
    name = re.sub(r"[™®©]", "", name)
    return re.sub(r"\s+", " ", name).strip()


async def hltb_lookup(hltb, name, sem):
    async with sem:
        for attempt in range(3):
            try:
                results = await hltb.async_search(clean(name))
                break
            except Exception as e:
                if attempt == 2:
                    return {"error": str(e)}
                await asyncio.sleep(3 * (attempt + 1))
        await asyncio.sleep(0.5)  # be polite
    if not results:
        return {"match": None}
    best = max(results, key=lambda r: r.similarity)
    return {
        "match": best.game_name,
        "similarity": round(best.similarity, 2),
        "main": best.main_story,
        "main_extra": best.main_extra,
        "completionist": best.completionist,
        "hltb_id": best.game_id,
    }


def stub_fake_useragent():
    """fake_useragent needs Python 3.8+; howlongtobeatpy only uses UserAgent().random."""
    try:
        import fake_useragent  # noqa: F401
        return
    except Exception:
        pass
    import types
    mod = types.ModuleType("fake_useragent")

    class UserAgent:
        random = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) "
                  "Gecko/20100101 Firefox/131.0")
    mod.UserAgent = UserAgent
    sys.modules["fake_useragent"] = mod


async def fetch_hltb(games, cache, batch, concurrency):
    stub_fake_useragent()
    from howlongtobeatpy import HowLongToBeat
    hltb = HowLongToBeat(0.3)
    sem = asyncio.Semaphore(concurrency)
    todo = [g for g in games if g["key"] not in cache["hltb"] or "error" in cache["hltb"][g["key"]]]
    print(f"HLTB: {len(games) - len(todo)} cached, {len(todo)} to fetch")
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        res = await asyncio.gather(*(hltb_lookup(hltb, g["name"], sem) for g in chunk))
        for g, r in zip(chunk, res):
            cache["hltb"][g["key"]] = r
        save_cache(cache)
        print(f"   batch {i // batch + 1}/{(len(todo) + batch - 1) // batch} done "
              f"({min(i + batch, len(todo))}/{len(todo)})")


# ---------------------------------------------------------------- main
def main():
    p = argparse.ArgumentParser()
    p.add_argument("collection", nargs="?")
    p.add_argument("--list", action="store_true")
    p.add_argument("--names", help="text file with one game name per line")
    p.add_argument("--steam-dir")
    p.add_argument("--batch", type=int, default=25)
    p.add_argument("--concurrency", type=int, default=3)
    a = p.parse_args()
    cache = load_cache()

    if a.names:
        lines = Path(a.names).read_text(encoding="utf-8").splitlines()
        games = [{"key": "name:" + n.strip(), "appid": "", "name": n.strip()} for n in lines if n.strip()]
        label = Path(a.names).stem
    else:
        cols = read_collections(find_steam_dir(a.steam_dir))
        if a.list or not a.collection:
            for name, ids, dyn in sorted(cols, key=lambda c: c[0].lower()):
                print(f"  {name!r}: {'dynamic collection' if dyn else f'{len(ids)} games'}")
            return
        match = [c for c in cols if c[0].lower() == a.collection.lower()]
        if not match:
            sys.exit(f"No collection named {a.collection!r}. Run with --list to see names.")
        name, ids, dyn = match[0]
        if dyn:
            sys.exit("That's a dynamic (filter-based) collection; Steam doesn't store its game list. "
                     "Export the names to a text file and use --names instead.")
        print(f"Collection {name!r}: {len(ids)} games")
        resolve_names(ids, cache)
        games = [{"key": f"app:{i}", "appid": i, "name": cache["names"].get(str(i), f"<unknown app {i}>")}
                 for i in ids]
        label = name

    asyncio.run(fetch_hltb(games, cache, a.batch, a.concurrency))

    rows = []
    for g in games:
        h = cache["hltb"].get(g["key"], {})
        me = h.get("main_extra") or None
        rows.append({
            "game": g["name"],
            "main_extra_h": me,
            "main_h": h.get("main") or None,
            "completionist_h": h.get("completionist") or None,
            "hltb_match": h.get("match") or "",
            "similarity": h.get("similarity", ""),
            "check": "" if h.get("match") and h.get("similarity", 0) >= 0.8 else "CHECK",
            "steam_appid": g["appid"],
            "hltb_url": f"https://howlongtobeat.com/game/{h['hltb_id']}" if h.get("hltb_id") else "",
        })
    rows.sort(key=lambda r: (r["main_extra_h"] is None, r["main_extra_h"] or 0, r["game"].lower()))

    out = HERE / ("hltb_" + re.sub(r"[^\w\-]+", "_", label).strip("_") + ".csv")
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    found = sum(1 for r in rows if r["main_extra_h"])
    flagged = sum(1 for r in rows if r["check"])
    print(f"\nDone: {found}/{len(rows)} games have a Main+Extras time, {flagged} flagged CHECK "
          f"(no match or fuzzy match).\nWrote {out}")


if __name__ == "__main__":
    main()
