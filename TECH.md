# Backlog tracker: technical plan

How to build what `SPEC.md` describes. Written 2026-10-17.

Decided: TypeScript everywhere; Preact + Vite for the frontend; Cloudflare Workers + D1 for the backend, with the static site on Cloudflare Pages; shared lists update by polling, no push.

## 1. Architecture

```
Browser                                   Cloudflare
┌───────────────────────────┐             ┌──────────────────────────────┐
│ Preact app (Pages)        │  /api/*     │ Worker (API)                 │
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
- One Cloudflare project: Pages serves the app, and a Worker handles `/api/*` and the share-page metadata.

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
games        (appid PK, name, has_portrait_art, len_main, len_main_extra, len_comp,
              len_source, len_source_id, len_checked_at, updated_at)

users        (id PK, steam_id UNIQUE, handle UNIQUE NULL, display_name, avatar_url,
              profile_public, settings_json, library_synced_at, created_at)
sessions     (id PK, user_id, expires_at)

-- Per-user state; rev = per-user change counter, used by sync
user_games   (user_id, appid, status, status_at, finished_at, note, manual_len,
              playtime_min, last_played_at, first_seen_at, rev, PK(user_id, appid))
views        (id PK, user_id, name, filter_json, sort, position, rev, deleted)
lists        (id PK, user_id, slug, title, description, kind /*manual|filter*/,
              filter_json, sort, visibility /*private|link|profile*/, rev, deleted,
              UNIQUE(user_id, slug))
list_items   (list_id, appid, position /*fractional index*/, rev, deleted,
              PK(list_id, appid))
user_rev     (user_id PK, rev)   -- last rev handed out
```

- IDs for views and lists are generated on the client (ULIDs), so they can be created offline.
- `deleted` keeps soft deletes for sync and undo; purge them after 30 days.
- Manual list order uses fractional index strings, so reordering one game writes one row.
- **Purchase date:** Steam's API doesn't expose it. Use `first_seen_at` (the first import that saw the game) and label the sort "Date added". For the first import, take the date from `rtime_last_played` if older, otherwise the import date.

## 4. Client

**State.** `@preact/signals`. One store module holds `games` (catalog fields + the user's fields merged per appid), `views`, `lists`, `settings`. Derived signals compute the visible set (filter → sort → group into bands). A library of 3,000 games filters in a few ms. Search uses a precomputed normalized name (lowercase, no ™®, accents folded).

**Persistence.** IndexedDB through `idb` (a tiny wrapper). Stores: `games`, `views`, `lists`, `listItems`, `outbox`, `meta` (sync cursor, user). The store loads everything at startup and writes changes through in batches each frame.

**Mutations and undo.** Every user action is a command: `{ apply(), invert() }`, built from ops (`setStatus`, `setNote`, `addToList`, …). Applying one updates the signals, writes IndexedDB, and appends ops to the outbox. Undo applies the inverse as a new command. One bulk action is one command, so one undo.

**Rendering.** Cover grid with fixed aspect-ratio cards, `loading="lazy"` images, `content-visibility: auto` per band section. That handles a few thousand covers without virtualization; add virtualization only if profiling says so. Portrait art (`library_600x900.jpg`) with `header.jpg` fallback via `onerror`, as in the prototype; record the fallback in the catalog (`has_portrait_art`) so later loads skip the failing request.

**Routing.** A small hand-written router (no dependency): `/` library, `/v/:viewId`, `/l/:listId`, `/settings`, `/u/:handle`, `/u/:handle/l/:slug`. The share routes are their own lazily loaded chunk, so viewers download little.

**Keyboard and palette.** A global key handler maps keys to commands, skipping text inputs. Grid focus moves by computing columns from the grid's measured width. The palette searches over games, views, lists and actions, with simple ranking (prefix > word start > substring).

**Offline.** `vite-plugin-pwa` precaches the app shell. The library works offline; the outbox flushes when back online.

**Bundle budget.** Initial JS under 50 KB gzipped. Preact + signals is about 6 KB.

## 5. Sync

One endpoint, called after local changes (debounced 1 s), on focus, and every 5 min:

```
POST /api/sync
{ since: <last rev seen>, ops: [{ id, type, ...fields, at }] }
→ { rev: <new cursor>, changes: { userGames: [...], views: [...], lists: [...], listItems: [...] } }
```

- The server applies ops in order in one D1 batch, giving each changed row the next `rev`, then returns every row of this user with `rev > since`, including the ones just written.
- **Conflicts:** last writer wins per row, ordered by when the server receives them. This is one person on a few devices, so a field-level merge isn't worth it. Notes are the only field where a lost edit would hurt; keep them per row too and accept the risk.
- Op IDs make retries idempotent: the server remembers op IDs for a day.
- The client removes ops from the outbox only after a successful response, then applies `changes` on top of any ops still pending.

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

## 8. Game lengths (IGDB)

- Auth with Twitch client credentials (client ID + secret as Worker secrets; cache the token in D1 until it expires).
- Map Steam appids to IGDB games through `external_games` (Steam category, `uid = appid`), up to 500 per query.
- Read `game_time_to_beats` for those games: `hastily` → Main, `normally` → Main + Extras, `completely` → Completionist (seconds → hours).
- A **Cron Trigger** every 5 minutes processes the enrichment queue (appids with `len_checked_at` null or older than 30 days), staying under IGDB's 4 requests/s.
- The client gets new lengths through the normal sync, since the server includes catalog rows updated after the client's last catalog cursor.
- Games with no data stay in the Unknown band; users can enter a manual length (`user_games.manual_len`), which always wins.

**First milestone task: coverage check.** IGDB's time-to-beat data is crowd-sourced and may be sparse. Before building on it, write `tools/igdb_coverage.ts`: for the 342 games in `tools/hltb_results.json`, fetch IGDB lengths and report how many have a value and how far they differ from HLTB. If coverage is poor, the fallback is to seed the catalog from community data or rely more on manual entry; decide then.

## 9. Lists and sharing

- **Manual lists** store items in `list_items`. **Filter lists** store `filter_json` + `sort` and have no items.
- **Filter engine** lives in `shared/filter.ts`: one JSON format (status set, length range, played/never launched, added before/after, name contains) and one `evaluate(filter, games)` function. The client uses it for views and filter lists; the Worker uses the same code to compute filter lists for viewers.
- `GET /api/u/:handle/l/:slug` returns list metadata, the owner's display name and avatar, and the games (appid, name, art flag, lengths, owner's status). It never returns notes. `private` lists return 404, same as missing ones.
- **Live updates:** the response carries an `ETag` derived from the user's current `rev` and the catalog version. The viewer page re-fetches with `If-None-Match` when it regains focus and every 30 s while visible, so unchanged lists cost a 304.
- **Link previews:** the Worker serves `/u/*` HTML through `HTMLRewriter`, injecting `og:title`, `og:description` ("12 games · 48 h") and an `og:image` (the first cover), so links look good in chats.
- **Copy to my backlog** (signed-in viewers): creates a manual list in the viewer's account with the same games, and marks which ones they don't own.
- `GET /api/u/:handle` returns the public profile and the lists marked `profile`, or 404 when the profile is off.

## 10. Export / import and account deletion

- Export format `{ format: "backlog-export", version: 1, exportedAt, games: [...user fields], views, lists, listItems }`, defined in `shared/export.ts`. Built on the client from local state.
- Import validates the version, shows counts, then applies everything as ops through the normal sync (merge or replace).
- `DELETE /api/account` deletes all the user's rows and sessions, then the client clears IndexedDB.

## 11. Testing

- **Vitest** for `shared/` (filter engine, bands, rounding, export round-trip) and the client store (commands, undo, outbox merge).
- **Worker tests** with `@cloudflare/vitest-pool-workers` against a local D1: sync semantics (idempotency, conflicts, `rev` ordering), share visibility, no notes leaking. Steam and IGDB calls stubbed.
- **Playwright** for the main flows: status change + undo, bulk select, create and share a list, view it signed out.
- A perf check in Playwright: load a 3,000-game fixture and assert filtering and a status change render within 100 ms.

## 12. Deployment

- `wrangler` for the Worker, D1 migrations and Pages. Preview deployments per branch, with their own D1 database.
- Secrets: `STEAM_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
- Local development: `wrangler dev` for the Worker + local D1, Vite dev server proxying `/api`. A dev-only sign-in route that skips Steam.

## 13. Milestones

Each one ends with something usable.

0. **Spike: IGDB coverage** (§8). Decides the length source.
1. **Local app + statuses.** Workspace setup, Preact app with the prototype's look: bands, cover grid, detail panel, statuses with undo, filters/sort/search, export/import. No backend yet: a dev script converts `tools/hltb_results.json` + the CSV into an export file to load the prototype library. Deployed on Pages.
2. **Speed layer.** Keyboard navigation, bulk select, command palette, smart views, Now playing shelf, header progress.
3. **Accounts, import, sync.** Worker + D1, Steam sign-in, library refresh, sync endpoint and outbox, IGDB enrichment cron, triage prompt, manual lengths, collection import, account deletion.
4. **Lists and sharing.** Manual and filter lists, handles, share pages with polling and link previews, public profile, copy to my backlog.

## 14. Risks and open points

- **IGDB coverage** may be too thin; milestone 0 settles it.
- **Steam API limits:** 100,000 calls per day per key, far above what a personal project needs. `GetOwnedGames` from Cloudflare IPs is untested; check it in milestone 3.
- **Delisted apps** have no name in `GetOwnedGames` either; show "Steam app <id>" as the prototype does.
- **Last-writer-wins** can drop a note edited on two devices at once. Accepted for v1.
- Shared list pages show the owner's statuses. That's in the spec; mention it in the sharing UI.
