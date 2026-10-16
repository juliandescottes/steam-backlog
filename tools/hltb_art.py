"""
Download Steam box art for every game in an hltb_*.csv (made by hltb_sort.py).

Usage:
    python3 hltb_art.py hltb_20_-_Not_started.csv

Saves art\\<appid>.jpg next to this script (portrait box art when Steam has it,
otherwise the wide store header). Re-running skips files already downloaded.
"""
import csv
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE / "art"
UA = {"User-Agent": "Mozilla/5.0 (hltb-art script)"}
HOSTS = [
    "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{id}/{f}",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/{f}",
]
FILES = ["library_600x900.jpg", "header.jpg"]


def fetch(appid):
    dest = ART / "{}.jpg".format(appid)
    if dest.exists() or dest.with_suffix(".wide.jpg").exists():
        return "cached"
    for f in FILES:
        for host in HOSTS:
            url = host.format(id=appid, f=f)
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = r.read()
                if len(data) < 2000:
                    continue
                target = dest if f.startswith("library") else dest.with_suffix(".wide.jpg")
                target.write_bytes(data)
                return "ok"
            except Exception:
                continue
    return "missing"


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 hltb_art.py <hltb csv>")
    ART.mkdir(exist_ok=True)
    with open(sys.argv[1], encoding="utf-8-sig") as f:
        ids = [r["steam_appid"] for r in csv.DictReader(f) if r.get("steam_appid")]
    print("Downloading box art for {} games...".format(len(ids)))
    stats = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for n, res in enumerate(pool.map(fetch, ids), 1):
            stats[res] = stats.get(res, 0) + 1
            if n % 50 == 0:
                print("   {}/{}".format(n, len(ids)))
    print("Done: {}. Files are in {}".format(stats, ART))


if __name__ == "__main__":
    main()
