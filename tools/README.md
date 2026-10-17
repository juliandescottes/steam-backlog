# Steam backlog by HowLongToBeat time

Sorts the Steam collection "20 - Not started" (342 games) by HowLongToBeat **Main + Extras** time and renders it as a page with box art, grouped into length bands.

## Files

| File | What it is |
|---|---|
| `backlog.html` | The finished page (self-contained, art embedded). Open it in a browser. |
| `template.html` | Page source. `build.py` injects `GAMES` and `ART` into it. |
| `build.py` | Builds `backlog.html` from the CSV, `hltb_results.json` and `art/`. |
| `hltb_console.js` | HLTB fetcher. Paste into the DevTools console on howlongtobeat.com; downloads `hltb_results.json`. Resumable (progress in that site's localStorage). |
| `hltb_sort.py` | Reads the collection from Steam's local data (`userdata/*/config/cloudstorage/cloud-storage-namespace-1.json`) and resolves app names. Its HLTB step (howlongtobeatpy) returned nothing on Python 3.7, hence the console script. |
| `hltb_art.py` | Downloads Steam box art into `art/` (`<appid>.jpg` portrait, `<appid>.wide.jpg` header fallback). |
| `hltb_20_-_Not_started.csv` | Collection export: names and Steam app IDs. |
| `hltb_results.json` | HLTB results keyed by Steam app ID (hours: `main`, `main_extra`, `completionist`; plus `match`, `sim`). |
| `hltb_cache.json` | Name cache from `hltb_sort.py`. |
| `igdb_coverage.ts` | Compares IGDB time-to-beat data with `hltb_results.json` (milestone 0 in `TECH.md`). `TWITCH_CLIENT_ID=… TWITCH_CLIENT_SECRET=… node tools/igdb_coverage.ts` (Node 23.6+); writes `igdb_results.json`. |
| `art/` | Original box art from Steam's CDN. |

## Rebuild

```
pip install pillow
python build.py hltb_results.json
```

Wrong fuzzy matches can be dropped in the `WRONG` table at the top of `build.py`.

For a static host like GitHub Pages, you can skip the base64 embedding and reference `art/<appid>.jpg` directly (or Steam's CDN), which keeps the page small.

## Known gaps

26 games have no time: 6 delisted Steam apps with no name, 8 with no HLTB match (Steam names like "Road 96 🛣️" or "System Shock® 2 (1999)"), 10 that HLTB lists without a Main + Extras time, and 2 Total War games whose only match was a different game.
