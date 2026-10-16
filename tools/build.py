"""Build the backlog page (backlog.html).
Usage: python build.py [hltb_results.json]   (no file = preview with placeholder times)
Needs hltb_20_-_Not_started.csv and the art/ folder next to it; Pillow (pip install pillow) to embed the box art.
"""
import base64, csv, datetime, io, json, random, sys, urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_art():
    """Thumbnail every image in art/ to WebP and return {appid: {w: is_wide, d: data URI}}. Cached in art.json."""
    cache = HERE / "art.json"
    if cache.exists():
        return json.loads(cache.read_text())
    from PIL import Image
    art = {}
    for f in sorted((HERE / "art").glob("*.jpg")):
        wide = ".wide." in f.name
        im = Image.open(f).convert("RGB")
        im.thumbnail((300, 140) if wide else (184, 276), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=70, method=6)
        art[f.name.split(".")[0]] = {"w": wide, "d": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()}
    cache.write_text(json.dumps(art))
    return art


rows = list(csv.DictReader(open(HERE / "hltb_20_-_Not_started.csv", encoding="utf-8-sig")))
art = load_art()
results = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else None
rnd = random.Random(7)
# Fuzzy matches checked by hand and found to be a different game
WRONG = {
    "Total War: ROME II - Emperor Edition": ("Rome: Total War",),
    "Total War: NAPOLEON – Definitive Edition": ("Total War: Empire - Definitive Edition",),
}

games = []
for r in rows:
    appid = r["steam_appid"]
    name = r["game"]
    if name.startswith("<unknown app"):
        name = f"Steam app {appid}"
    g = {"id": int(appid), "name": name}
    if results is None:
        me = rnd.choice([None] + [round(rnd.lognormvariate(2.4, 0.9), 1) for _ in range(12)])
        g.update(me=me, main=me and round(me * .7, 1), comp=me and round(me * 1.8, 1), uncertain=rnd.random() < .08, match=name)
    else:
        h = results.get(appid, {})
        if h.get("match") in WRONG.get(r["game"], ()):
            h = {}
        g.update(me=h.get("main_extra"), main=h.get("main"), comp=h.get("completionist"),
                 match=h.get("match"), uncertain=bool(h.get("match")) and not h.get("steamMatch") and (h.get("sim") or 0) < .85)
    g["hltb"] = (f"https://howlongtobeat.com/game/{h['id']}" if results is not None and h.get("id")
                 else "https://howlongtobeat.com/?q=" + urllib.parse.quote(name))
    games.append(g)

used_art = {k: v for k, v in art.items() if any(str(g["id"]) == k for g in games)}
total = round(sum(g["me"] or 0 for g in games))
html = open(HERE / "template.html", encoding="utf-8").read()
html = (html.replace("__COLLECTION__", "20 - Not started")
            .replace("__COUNT__", str(len(games)))
            .replace("__TOTAL__", f"{total:,}")
            .replace("__DATE__", datetime.date.today().strftime("%d %B %Y"))
            .replace("__GAMES__", json.dumps(games, ensure_ascii=False))
            .replace("__ART__", json.dumps(used_art)))
if results is None:
    html = html.replace('<div class="eyebrow">', '<div class="eyebrow" style="color:var(--b5)">Preview · placeholder times · </div><div class="eyebrow">', 1)
open(HERE / "backlog.html", "w", encoding="utf-8").write(html)
print(len(games), "games,", total, "h,", round(len(html) / 1e6, 2), "MB")
