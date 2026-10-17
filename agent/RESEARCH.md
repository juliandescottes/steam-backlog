# Research notes

## Steam

- Collections aren't in any API. They live in `Steam/userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json` (`user-collections.*`, `added`/`removed` app IDs; dynamic ones have `filterSpec`). Parsed by `tools/hltb_sort.py`.
- `IPlayerService/GetOwnedGames` gives the library with playtime; needs an API key and a public profile.
- Names in bulk: `IStoreBrowseService/GetItems/v1` (50 per call); fallback `store/api/appdetails` (rate limited). Names can contain HTML entities.
- Art: `…/steam/apps/<appid>/library_600x900.jpg`, fallback `header.jpg`. Delisted apps may have neither.
- No purchase dates in the API.

## HowLongToBeat

- No API; `howlongtobeatpy` returned nothing. `tools/hltb_console.js` (DevTools console on the site) worked.
- Aggressive rate limits: 429 at 3 parallel requests, one 403 block. 1 request at a time + 1.5 s pause worked.
- Against their terms; not used by the product.

## IGDB (2026-10-17, 342-game collection)

- 341/342 found via Steam app ID (`external_games`, `external_game_source = 1`).
- Main + Extras time: 60% (HLTB: 92%). With `version_parent`/`parent_game` fallback: 62%.
- When both exist: median diff 15%, 68% same band; 77% with 3+ submissions.
- `parent_game` is wrong for standalone expansions; use `version_parent` only.
- Misses are mostly older and niche games.

## SteamSpy

- Still reports owners, but playtime is always 0 now. Unusable for lengths.
