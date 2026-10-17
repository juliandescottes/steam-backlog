# Status

Updated 2026-10-18. Branch: `m4-lists` (from `m2-speed-layer`).

## Milestones

- [x] 0. IGDB coverage check (`TECH.md` §8)
- [x] 1. Local app + statuses. Live at https://baquelogue.com (deployed 2026-10-17, `npm run deploy`)
- [x] 2. Speed layer: keyboard grid nav, bulk select, command palette, smart views, Now playing shelf. Live 2026-10-17
- [x] 3. Accounts, Steam import, sync, IGDB cron, community lengths, triage prompt, account deletion. Live 2026-10-17 (D1 `baquelogue`, secrets set, cron every minute)
- [x] 4. Lists and sharing, public profile. Live 2026-10-17. Copy to my backlog and Steam collections import dropped (2026-10-17)

## Now

The v1 plan (milestones 0–4) is done and deployed (2026-10-17). Next: the UX pass below.

Lists (`shared/lists.ts`: fractional positions, share ids). Hand-picked or filter-based (from the current view); drawer from the header's Lists button; list page (`app/src/route.ts`) with its own statuses and sort, "List order" for hand-picked ones; add with the cover's +, `A`, the detail panel, the selection bar or the palette; drag or Alt+←/→ to reorder; rename, describe, delete with undo. Sync (ops `list` and `item`, migration 0004) and backups include lists and views.

Sharing: links are `/l/<shareId>` (migration 0005; `/s/` redirects), the Share panel is Private / Anyone with the link + copy, viewers see the Steam name. A list has one address, `/l/<shareId>`: the owner's page if the list is in this browser, the shared page otherwise; `/l/<internal id>` and `/s/<shareId>` redirect. `GET /api/s/:shareId` with ETag/304, `/l/*` pages with Open Graph tags. Viewer page `Shared.tsx` is a lazy chunk, read-only, polls every 30 s while visible.

Public profile: Settings → Public profile (off by default; username suggested from the Steam name; stats on/off), "Show on my public profile" in the Share panel (visibility `profile`). `/u/<handle>` page with the chosen lists (covers, size, hours); shared list pages link to it when it's on. `POST /api/profile` replaced `/api/handle`; `GET /api/u/:handle`; `/u/*` link previews. Optional "Show my whole backlog": a Backlog card on the profile and `/u/<handle>/backlog`, the whole library read-only, starting on Backlog + Playing.

Production check (2026-10-17, 761-game library): callback 594 ms, import 5.3 s wall / 26 ms CPU, sync 8–14 ms CPU, cron 3–4.5 s wall / 10–14 ms CPU. All over the free plan's 10 ms CPU but none failed; watch `wrangler tail` for "exceeded CPU" (fix: Workers Paid, or paged sync and smaller batches).

## Next: UX pass (asked 2026-10-18)

1. Creating a list: an easy way to jump to it (a link, e.g. in the toast).
2. Now playing shelf: a setting, off by default (it takes a lot of screen).
3. Settings: clearer visual separation between sections.
4. "Delete account…" should look like a button.
5. The Lists button: move it left, near where the drawer opens; make it more visible.
6. List title and description: edit in place, no size or layout change when they become inputs; a pen icon next to each instead of the Rename button.
7. Sharing: replace the "Share"/"Shared ✓" toggle button with an always visible sharing section at the top of the list, with a "Share" / "Make private" button instead of the Private / Anyone segmented control.
8. Confirm before deleting a list, the account, etc.? Undecided: it goes against the rule in `agent/UI.md` ("no confirmation dialogs; undo toast instead"); discuss which matters more before doing it.

## Backlog

- Triage marks all candidates at once (125 on the real library, some fighting games among them); maybe a "Review them" view.
- No preview deployments per branch yet (TECH §12).
- Delisted apps show "Steam app 11420"; IGDB has names for some.
- Covers are blank tiles while art loads.
- Clicking an approximate badge does nothing (it catches hover for the tooltip); maybe open the detail panel.
- "Uncertain lengths" smart view (M2).
- Bulk select on touch screens: the checkbox only shows on hover, so there's no way to start a selection yet.
- A focused card scrolled far away by mouse unmounts and drops focus; arrows resume from it.
- Reordering a list on touch screens: HTML drag and drop doesn't work there, and Alt+arrows need a keyboard.
- A private list's address opened by someone else says "List not found. It may be private now, or the link changed."; maybe say plainly that it's private (the API can't tell them apart on purpose).
- Share panel: warn while the list hasn't synced yet, or the copied link says "List not found" for a few seconds.
- Ops reach IndexedDB asynchronously (`void db.addOps`): closing or reloading the tab right after a change can lose it before it syncs. Maybe flush on `pagehide`, or await the write before scheduling.
- The whole-backlog page sends every game (a few hundred KB for 1,000 games) and renders every card, without the windowed shelves; fine at ~1,000, slow at several thousand.
- Restoring a backup with "replace" clears the outbox and sync cursor too (`db.clearAll`), even when signed in.
