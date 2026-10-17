# Backlog tracker: technical plan

How to build what `SPEC.md` describes. Written 2026-10-17.

Decided: TypeScript everywhere; Preact + Vite for the frontend; one Cloudflare Worker with static assets serving the app and the API, with D1; shared lists update by polling, no push.

## 1. Architecture

```
Browser                                   Cloudflare
┌───────────────────────────┐             ┌──────────────────────────────┐
│ Preact app (assets)       │  /api/*     │ Worker (API)                 │
│  in-memory state (signals)│ ──────────▶ │  auth, sync, import, shares  │
│  IndexedDB (persistence)  │             │  cron: length enrichment     │
│  outbox of pending ops    │             └──────┬───────────────┬───────┘
└────────────┬──────────────┘                    │               │
             │ covers                            ▼               ▼
             ▼                                 D1 (SQLite)   Steam Web API,
     Steam CDN (direct)                                      Steam OpenID, IGDB
```

- **Local-first.** The client holds the user's whole library in memory and persists it to IndexedDB. Every UI action changes local state synchronously, then queues an op for the server. The network never sits between a keypress and the UI.
- **The server is the source of truth across devices** and is the only thing that can serve shared lists.
- **Covers come straight from Steam's CDN.** No image hosting.
- One Worker at `baquelogue.com` (`wrangler.jsonc`): its static assets serve the app, and its script handles `/api/*` and the share-page metadata.

## 2. Repo layout

```
app/        Preact + Vite client
worker/     Cloudflare Worker (API, cron), D1 migrations in worker/migrations/
shared/     Code used by both: types, filter engine, length bands, export format
tools/      Prototype scripts and data (kept as is)
backlog/    Prototype page (kept until the app replaces it)
```

A single `package.json` with npm workspaces. Shared code is imported from source; no separate build step.

## 3. Data model (D1)

```sql
-- Global catalog, shared by all users
games        (appid PK, name, has_portrait_art, igdb_id,
              igdb_main, igdb_main_extra, igdb_comp, igdb_count, igdb_checked_at,
              comm_main_extra, comm_count, comm_endless_count, updated_at)
community_lengths (user_id, appid, kind /*typed|finished_playtime|endless*/,
              main, main_extra, comp, created_at, PK(user_id, appid, kind))

users        (id PK, steam_id UNIQUE, handle UNIQUE NULL, display_name, avatar_url,
              profile_public, settings_json, library_synced_at, created_at)
sessions     (id PK, user_id, expires_at)

-- Per-user state; rev = per-user change counter, used by sync
user_games   (user_id, appid, status, status_at, finished_at, note,
              my_main, my_main_extra, my_comp, my_len_kind /*exact|approx|endless*/,
              playtime_min, last_played_at, first_seen_at, rev, PK(user_id, appid))
views        (id PK, user_id, name, filter_json, sort, position, rev, deleted)
lists        (id PK, user_id, slug, title, description, kind /*manual|filter*/,
              filter_json, sort, visibility /*private|link|profile*/, rev, deleted,
              UNIQUE(user_id, slug))
list_items   (list_id, appid, position /*fractional index*/, rev, deleted,
              PK(list_id, appid))
user_rev     (user_id PK, rev)   -- last rev handed out
```

- IDs for views and lists are generated on the client (UUIDs), so they can be created offline.
- Migration 0004 recreated `lists` and `list_items` (with `user_id`, for sync by rev). Migration 0005 replaced the per-user `slug` with `share_id`: 12 random base-36 characters made on the client with the list, globally unique, never updated by ops (so no sync batch can fail on the unique index).
- `deleted` keeps soft deletes for sync and undo; purge them after 30 days.
- Manual list order uses fractional index strings, so reordering one game writes one row.
- **Purchase date:** Steam's API doesn't expose it. Use `first_seen_at` (the first import that saw the game) and label the sort "Date added". For the first import, take the date from `rtime_last_played` if older, otherwise the import date.

## 4. Client

**State.** `@preact/signals`. One store module holds `games` (catalog fields + the user's fields merged per appid), `views`, `lists`, `settings`. Derived signals compute the visible set (filter → sort → group into bands). A library of 3,000 games filters in a few ms. Search uses a precomputed normalized name (lowercase, no ™®, accents folded).

**Persistence.** IndexedDB through `idb` (a tiny wrapper). Stores: `games`, `views`, `lists`, `listItems`, `outbox`, `meta` (sync cursor, user). The store loads everything at startup and writes changes through in batches each frame.

**Mutations and undo.** Every user action is a command: `{ apply(), invert() }`, built from ops (`setStatus`, `setNote`, `addToList`, …). Applying one updates the signals, writes IndexedDB, and appends ops to the outbox. Undo applies the inverse as a new command. One bulk action is one command, so one undo.

**Rendering.** Cover grid with fixed-height cards (2:3 cover, fixed text block) and `loading="lazy"` images. Each band mounts only the rows within a screen of the viewport, with spacers for the rest: mounting all cards took ~450 ms at 3,000 games on an M1 Pro (profiled 2026-10-17), and `content-visibility` didn't help. Portrait art (`library_600x900.jpg`) with `header.jpg` fallback via `onerror`, as in the prototype; record the fallback in the catalog (`has_portrait_art`) so later loads skip the failing request.

**Routing.** A small hand-written router (`app/src/route.ts`, no dependency): `/` library, `/l/:listId`; later `/u/:handle`, `/u/:handle/l/:slug`. The share routes are their own lazily loaded chunk, so viewers download little.

**Keyboard and palette.** A global key handler maps keys to commands, skipping text inputs. Grid focus moves by computing columns from the grid's measured width. The palette searches over games, views, lists and actions, with simple ranking (prefix > word start > substring).

**Offline.** `vite-plugin-pwa` precaches the app shell. The library works offline; the outbox flushes when back online.

**Bundle budget.** Initial JS under 50 KB gzipped. Preact + signals is about 6 KB.

## 5. Sync

One endpoint, called after local changes (debounced 1 s), on focus, and every 5 min:

```
POST /api/sync
{ since: <last rev seen>, catalogSince: <last catalogAt>, ops: [{ id, type: "game", appid, at, set: { status?, statusAt?, finishedAt?, note?, my?, myKind? } }] }
→ { rev: <new cursor>, catalogAt, games: [<Game>...] }
```

Types and op validation in `shared/src/sync.ts`, server in `worker/src/sync.ts`, client in `app/src/account.ts`. Ops of type `game`, `view`, `list` and `item` (a game's place in a list, `deleted` to take it out); the response carries changed games, views, lists and items.

- **Ops carry values, not actions** ("status = finished, finishedAt = …", not "finish"). Undo is just another op, and replaying one is harmless.
- Ops are `game` (by appid) or `view` (by view id: name, filter, sort, position, `deleted`). Views are created on first op and only their owner's ops update them.
- The server merges ops per game (later ones win per field), applies them in one D1 batch giving each changed row the next `rev`, then returns every game of this user with `rev > since` or a catalog change (IGDB, community) since `catalogSince`. `catalogAt` trails by a minute so a concurrent write is sent twice rather than missed.
- **Conflicts:** last writer wins per field, ordered by when the server receives them. This is one person on a few devices. Notes are the only field where a lost edit would hurt; accept the risk.
- **D1 limits** (100 bound parameters per query, 50 queries per request on the free plan): bulk writes pass their rows as one JSON parameter and expand them with `json_each`.
- Op IDs make retries idempotent: the server remembers op IDs for a day.
- The client removes ops from the outbox only after a successful response, then applies the returned games with any ops still pending on top.
- **First sign-in on a device:** local statuses, notes and lengths become ops (they apply to games the Steam library has), then the account's library replaces the local one. Sign-out syncs, then clears the browser.

## 6. Auth (Steam OpenID 2.0)

1. `GET /api/auth/steam` redirects to `https://steamcommunity.com/openid/login` with `return_to=/api/auth/callback`.
2. The callback re-posts the parameters to Steam with `openid.mode=check_authentication`. On `is_valid:true`, it reads the SteamID64 from `openid.claimed_id`.
3. Upsert the user, fetching the name and avatar via `ISteamUser/GetPlayerSummaries`. Create a session: random 32-byte ID in `sessions`, sent as an `HttpOnly; Secure; SameSite=Lax` cookie, valid 30 days and refreshed on use.
4. Mutating endpoints also require an `X-Requested-With` header, which forms can't set (CSRF protection on top of SameSite).

**Handles.** `/u/<handle>` needs a unique name. The first time a user shares something, prompt for a handle, suggesting their Steam vanity URL or persona name, slugified. It can be changed in Settings; old links break (acceptable for v1).

## 7. Library import

- `POST /api/library/refresh` calls `IPlayerService/GetOwnedGames` (`include_appinfo=1`, `include_played_free_games=1`) with our API key stored as a Worker secret.
- An empty response means a private profile → error code `profile_private`, which the client turns into the guide from the spec.
- Upsert catalog rows (name from `appinfo`) and `user_games` rows (playtime, last played; new games get status Backlog). Queue appids without lengths for enrichment.
- Runs automatically after sign-in when `library_synced_at` is older than 24 h.
- **Triage prompt** (spec §2.4): computed on the client once lengths arrive: games with `playtime ≥ 0.8 × length`.

**Steam collections import** runs entirely in the browser: the user picks `cloud-storage-namespace-1.json`, the client parses the `user-collections.*` entries (port of the parsing in `tools/hltb_sort.py`), and creates one manual list per static collection. Dynamic collections (`filterSpec`) are listed but skipped in v1. The file never leaves the browser.

## 8. Game lengths

**Coverage check (milestone 0, done 2026-10-17).** `tools/igdb_coverage.ts` on the 342-game prototype collection:

| Source | Has Main + Extras | Same band as HLTB |
|---|---|---|
| IGDB (341/342 games found by Steam app ID or name) | 205 (60%) | 68% |
| IGDB, 3+ submissions | 119 (35%) | 77% |
| IGDB + `version_parent` / `parent_game` fallback | 213 (62%) | 68% |
| SteamSpy median playtime | 0: SteamSpy no longer publishes playtime | — |
| HLTB, for reference | 316 (92%) | — |

`parent_game` gave one bad result (a standalone expansion got its base game's 54 h instead of 15 h), so the app follows `version_parent` only. Decision: IGDB is the base, and the rest comes from users through a fast fill-in flow (SPEC §4) and community lengths.

**IGDB enrichment**
- Auth with Twitch client credentials (client ID + secret as Worker secrets; the token is cached in D1's `cache` table until a day before it expires).
- Map Steam appids to IGDB games through `external_games` (`external_game_source = 1`, `uid = appid`), up to 500 per query. Fall back to an exact normalized name search.
- Read `game_time_to_beats`: `hastily` → Main, `normally` → Main + Extras, `completely` → Completionist (seconds → hours), and `count`. When the game has no entry, use its `version_parent`'s.
- A **Cron Trigger** every minute processes one batch of the queue (appids with `igdb_checked_at` null, or older than 30 days, or 7 days while unknown): 100 games, at most 40 name searches, so a run stays under the free plan's 50 outbound requests and IGDB's 4 requests/s. A library import with new games runs one batch right away (`waitUntil`). Code in `worker/src/igdb.ts`.
- Measured on a 761-game library (2026-10-17): 752 matched, 483 with Main or Main + Extras, 289 with 3+ submissions; 8 runs of 2–6 s.
- Decode HTML entities in Steam names at import (`&amp;` appears in `GetOwnedGames` names).

**Community lengths**
- `community_lengths` gets one row per user and game and kind: `typed` when a user enters an exact length, `finished_playtime` when they mark a game Finished with playtime over 30 min, `endless` for No ending. Approximate guesses aren't recorded. Users who turn off sharing write no rows; turning it off deletes theirs.
- `community_lengths` mirrors the user's games: the sync batch that changes a game rewrites its rows (`worker/src/community.ts`). Imported lengths (`myKind: "imported"`) aren't shared, and `/api/settings` `{ shareLengths }` deletes or rewrites all of a user's rows.
- Then the Worker recomputes the game's `comm_main_extra`, `comm_count`, `comm_endless_count`. Each user counts once (typed Main + Extras, else finished playtime; No ending instead of either). The median limits idle-time outliers.

**Which length is shown** (computed in `shared/lengths.ts`, used by client and Worker):
1. The user's own length (`my_*`, including approximate and endless).
2. Community, when `comm_count ≥ 3` and it has more entries than IGDB's `count`; No ending when `comm_endless_count ≥ 3` and outnumbers the length entries.
3. IGDB, marked approximate when `count < 3`.
4. Community with 1–2 entries, marked approximate.
5. Unknown.

The result carries its source and an approximate flag for the badge and detail panel.

**Fill-in input** (`shared/length-input.ts`, unit-tested): parses `12`, `12.5`, `12,5`, `12½`, `12h30`, `12:30`, `45m`, and pasted HowLongToBeat-style blocks (`Main Story … Main + Extras … Completionist …`, values with `½` or fractions, "Hours"/"Mins"). Rounds to 0.25 h. Band shortcuts `Alt+1`–`Alt+7` map to typical values: 2, 4.5, 8, 15, 30, 60, 100 h.

**Lengths import** (Settings): JSON or CSV of `appid` + hours (or `main` / `main_extra` / `completionist`), applied as `my_*` through the normal sync. A dev script in `tools/` converts `hltb_results.json` (respecting `WRONG` in `build.py`) into that format.

## 9. Lists and sharing

- **Manual lists** store items in `list_items`. **Filter lists** store `filter_json` + `sort` and have no items.
- **Filter engine** lives in `shared/filter.ts`: one JSON format (status set, length range, played/never launched, added before/after, name contains) and one `evaluate(filter, games)` function. The client uses it for views and filter lists; the Worker uses the same code to compute filter lists for viewers.
- Share links are `/s/<shareId>` (decided 2026-10-17: a handle and a slug were too many steps; the handle is only for the public profile). `GET /api/s/:shareId` (`worker/src/share.ts`) returns list metadata, the owner's display name and avatar, and the games as client `Game`s with notes, playtime and dates blanked. `private`, deleted and missing lists all return 404. Filter lists are computed on the server by Main + Extras (the owner's measure is a local setting).
- **Live updates:** the response carries an `ETag` from the owner's `rev`, the sum of the games' catalog `updated_at` and the game count. The viewer page re-fetches with `If-None-Match` when it regains focus and every 30 s while visible, so unchanged lists cost a 304.
- **Link previews:** `/s/*` runs the Worker first (`run_worker_first`); it serves `index.html` with the `<title>` replaced (plain string replace, so tests run in Node), injecting `og:title`, `og:description` ("12 games · 48 h") and an `og:image` (the first cover), so links look good in chats.
- **Copy to my backlog** (signed-in viewers): creates a manual list in the viewer's account with the same games, and marks which ones they don't own.
- `GET /api/u/:handle` returns the public profile and the lists marked `profile`, or 404 when the profile is off.

## 10. Export / import and account deletion

- Export format `{ format: "backlog-export", version: 1, exportedAt, games: [...user fields], views, lists, listItems }`, defined in `shared/files.ts`; views, lists and items are validated like sync ops. Built on the client from local state.
- Import validates the version, shows counts, then applies everything as ops through the normal sync (merge or replace).
- `DELETE /api/account` deletes all the user's rows and sessions, then the client clears IndexedDB.

## 11. Testing

- **Vitest** for `shared/` (filter engine, bands, rounding, length resolution and input parsing, export round-trip) and the client store (commands, undo, outbox merge).
- **Worker tests** with `@cloudflare/vitest-pool-workers` against a local D1: sync semantics (idempotency, conflicts, `rev` ordering), share visibility, no notes leaking. Steam and IGDB calls stubbed.
- **Playwright** for the main flows: status change + undo, bulk select, create and share a list, view it signed out.
- A perf check in Playwright: load a 3,000-game fixture and assert filtering and a status change render within 100 ms.

## 12. Deployment

- `wrangler` for the Worker, static assets and D1 migrations; `npm run deploy` builds and deploys. Preview deployments per branch (Workers Builds from GitHub, own D1 database): planned, not set up.
- Dashboard-only settings on the `baquelogue.com` zone: Always Use HTTPS; Redirect Rule `https://www.*` → `https://${1}` (301, query kept) with a proxied `www` A record to `192.0.2.1`.
- D1 `baquelogue` (`database_id` in `wrangler.jsonc`); `npx wrangler d1 migrations apply baquelogue --remote` before deploying a new migration. Local dev data lives in a file named after that id.
- Secrets (`wrangler secret put`, never `secret bulk .dev.vars`, which has `DEV_LOGIN`): `STEAM_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
- Cron Triggers need a workers.dev subdomain on the account (created by opening Workers & Pages once), even with `workers_dev: false`.
- Local development: `npm run dev:api` (local D1 migrations + `wrangler dev` on 8790) next to `npm run dev`; Vite proxies `/api`. `.dev.vars` sets `DEV_LOGIN=true`: `POST /api/auth/dev` signs in without Steam, and without `STEAM_API_KEY` the import returns a fixed five-game library. `--test-scheduled` lets you trigger a cron run: `POST /cdn-cgi/local/explorer/api/local/scheduled?worker=baquelogue` with `{"cron":"* * * * *"}` (`/__scheduled` is shadowed by the static assets). Worker tests run in Node against a local D1 through wrangler's `getPlatformProxy` (`@cloudflare/vitest-pool-workers` needs vitest 4).

## 13. Milestones

Each one ends with something usable.

0. **Spike: IGDB coverage** (§8). Done: IGDB plus user-entered lengths.
1. **Local app + statuses.** Workspace setup, Preact app with the prototype's look: bands, cover grid, detail panel, statuses with undo, filters/sort/search, export/import, the fill-in flow for missing lengths and lengths import. No backend yet: a dev script converts `tools/hltb_results.json` + the CSV into an export file to load the prototype library. Deployed to `baquelogue.com`.
2. **Speed layer.** Keyboard navigation, bulk select, command palette, smart views, Now playing shelf, header progress.
3. **Accounts, import, sync.** Worker + D1, Steam sign-in, library refresh, sync endpoint and outbox, IGDB enrichment cron, community lengths, triage prompt, account deletion.
4. **Lists and sharing.** Manual and filter lists, handles, share pages with polling and link previews, public profile, copy to my backlog. Optional: Steam collections import (lists to land in).

## 14. Risks and open points

- **Unknown lengths** will be common for older and niche libraries (38% here). The fill-in flow has to be fast, and community lengths only help once there are users.
- **Community abuse:** anyone can submit lengths. Medians, one entry per user, and the 3-entry threshold limit it for v1; add per-user rate limits if needed.
- **Steam API limits:** 100,000 calls per day per key, far above what a personal project needs. `GetOwnedGames` from Cloudflare works (checked 2026-10-17).
- **Free plan CPU (10 ms):** import, full sync and cron runs measured 10–26 ms on a 761-game library without failing. If they start failing, Workers Paid or paged sync.
- **Delisted apps** have no name in `GetOwnedGames` either; show "Steam app <id>" as the prototype does.
- **Last-writer-wins** can drop a note edited on two devices at once. Accepted for v1.
- Shared list pages show the owner's statuses. That's in the spec; mention it in the sharing UI.
