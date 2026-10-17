# Backlog tracker: project handoff

Context for resuming this project in a coding session. Written 2026-10-17 from a planning conversation.

## Goal

A personal game backlog tracker with a simple, fast, polished UI. Personal tool first; maybe public later.

The reason to build it: existing tools (Backloggd, Grouvee, Infinite Backlog, HLTB's own backlog) feel slow, managing lists in them is cumbersome, and they lack polish. **Speed and low-friction UX are the product.** The angle: "shortest-first, zero friction". Import your library and immediately see what you can finish this weekend.

## Starting point (this folder)

A working prototype exists: `backlog/index.html`, built by `tools/build.py` from `tools/template.html`. See `tools/README.md` for the file list.

- Shows the Steam collection "20 - Not started": 342 games, ~6,072 h of HLTB Main + Extras.
- Games grouped into length bands: under 3 h, 3-6, 6-10, 10-20, 20-40, 40-80, 80+, no data. A stacked bar plus legend at the top jumps to each band.
- Box art covers in a grid. Wide header art falls back with a blurred background. Hours badge on each cover, styled by band color.
- Name filter, "only uncertain matches" toggle, dark/light themes, works at phone width.
- Hours shown as decimals rounded to 0.25 (e.g. `1.75 h`, not fractions). User preference.
- Covers link to the Steam store page; times link to the HLTB page.

Data already collected (in `tools/`): `hltb_20_-_Not_started.csv` (names, app IDs), `hltb_results.json` (HLTB times keyed by Steam app ID). The `art/` folder (341 covers) is not in the repo; the real app loads covers from Steam's CDN instead.

## Lessons from building the prototype

**Steam**
- Collections are **not available from any API**. They only exist locally in `Steam/userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json` (entries keyed `user-collections.*`; `added`/`removed` app ID arrays; dynamic collections have `filterSpec` and no stored list). `hltb_sort.py` parses this.
- The Steam Web API `GetOwnedGames` gives the full library with playtime, but needs an API key and a public profile.
- App names in bulk: `IStoreBrowseService/GetItems/v1` (50 per call); fallback `store/api/appdetails` (rate limited).
- Covers: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/<appid>/library_600x900.jpg`, falling back to `header.jpg` (wide). Some delisted apps have neither name nor store data.

**HowLongToBeat**
- No official API. The Python lib `howlongtobeatpy` returned zero results from outside the site, and its `fake_useragent` dep needs Python 3.8+. MozillaBuild ships 3.7.
- What worked: `hltb_console.js`, run in the DevTools console on howlongtobeat.com. It finds the search endpoint in the site's JS, gets a token from `<endpoint>/init`, and POSTs searches.
- Rate limiting is aggressive: 429s at 3 parallel requests, and a 403 block once. Working settings: 1 request at a time, 1.5 s pause, exponential backoff on 429, stop on a repeated 403, progress saved in localStorage so runs resume. ~336 games took ~15 min.
- Matching: name variants (strip ™®, edition words like Definitive/Remastered/GOTY, subtitles), Levenshtein similarity, prefer `profile_steam` == app ID when present. 26/342 ended with no time; 2 fuzzy matches were wrong (see `WRONG` in `build.py`).
- **Conclusion: don't build the real app on scraping HLTB.** It's fragile and against their terms. Check **IGDB** (Twitch, official API) for cover art and time-to-beat data; verify its coverage against `hltb_results.json`. Cache times in our own store either way; never look them up live.

## Product design

The detailed user-facing spec is in `SPEC.md` (written 2026-10-17). It supersedes the notes below where they differ.

**Speed: local-first, with a small backend**
- The whole library lives in the browser (IndexedDB). Every action is instant: status changes, filtering, sorting.
- A small backend is needed from v1: users sign in with Steam and share curated lists with live updates. Sync runs in the background and never blocks the UI.
- Optimistic UI with undo. No confirmation dialogs.

**Low-friction list management**
- **Statuses first.** Moving a game between states is most of the work. Decided: Backlog (default), Playing, Finished, Dropped.
- **Lists for curating and sharing:** hand-picked or filter-based, private by default, shareable by link (see `SPEC.md` §6).
- One click or one key on a cover: `p` playing, `f` finished, `d` dropped.
- **Bulk actions:** shift-click a range of covers, then press a key. Needed for the first import.
- Search-as-you-type over everything, plus a command palette (Ctrl+K).
- Full keyboard navigation of the grid.
- **Smart views instead of hand-built lists:** saved filters such as "Under 5 h", "Owned 2+ years, never launched", "Short and well rated". Nothing to maintain.

**Tracking features**
- A "Now playing" shelf at the top.
- The header shows what's left ("212 games, 3,140 hours to clear") with a progress bar that fills as games are finished.
- Filter per status.
- Sort by length (default), purchase date, rating, or a manual "up next" order.

**Polish**
- Covers are the main interface. A few good fonts, restraint, no ads or social features.
- Keep the prototype's visual direction; it's already a better baseline than existing tools.

## Roadmap

1. **Prototype + statuses.** Yesterday's page with statuses stored in IndexedDB, plus JSON export/import for backups. Static site.
2. **UX speed layer.** Keyboard shortcuts, bulk select, command palette, smart views.
3. **Accounts + library import.** Steam OpenID sign-in, Steam `GetOwnedGames` (with playtime, which can auto-detect "started, never finished"), collection import from `cloud-storage-namespace-1.json`. Time-to-beat from IGDB, cached server-side. Background sync of the local library to the backend.
4. **Lists + sharing.** Hand-picked and filter-based lists, live shared links, public profile. Backend options: Cloudflare Workers + D1, or Supabase.

## Hosting notes

- Static site plus a small API (Cloudflare Pages + Workers fits both). Load covers directly from Steam's CDN instead of embedding base64 as the prototype does; the embedding was only needed for the Claude artifact, which can't load external images. Shared lists store only app IDs, so the backend hosts no images.
- Google Drive won't render HTML (only a thumbnail and the source). Claude artifact sharing requires viewers to sign in to Claude. Neither fits a public page.

## Open questions

- IGDB time-to-beat coverage vs HLTB for this library.
- Whether viewers of a shared list see the owner's per-game notes (proposal: no).
- Backend choice: Cloudflare Workers + D1 vs Supabase.

Resolved 2026-10-17: four statuses (no On hold or Wishlist in v1); games without times go in an Unknown band with manual entry; Steam only for v1.
