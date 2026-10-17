# Status

Updated 2026-10-17. Branch: `m4-lists` (from `m2-speed-layer`).

## Milestones

- [x] 0. IGDB coverage check (`TECH.md` §8)
- [x] 1. Local app + statuses. Live at https://baquelogue.com (deployed 2026-10-17, `npm run deploy`)
- [x] 2. Speed layer: keyboard grid nav, bulk select, command palette, smart views, Now playing shelf. Live 2026-10-17
- [x] 3. Accounts, Steam import, sync, IGDB cron, community lengths, triage prompt, account deletion. Live 2026-10-17 (D1 `baquelogue`, secrets set, cron every minute)
- [ ] 4. Lists and sharing (+ optional Steam collections import, moved from 3 on 2026-10-17)

## Now

Milestone 4. M2 and lists deployed 2026-10-17.

Done: lists (`shared/lists.ts`: fractional positions, slugs). Hand-picked or filter-based (from the current view); drawer from the header's Lists button; list page at `/l/<id>` (`app/src/route.ts`) with its own statuses and sort, "List order" for hand-picked ones; add with the cover's +, `A`, the detail panel, the selection bar or the palette; drag or Alt+←/→ to reorder; rename, describe, delete with undo. Sync (ops `list` and `item`, migration 0004) and backups include lists and views.

Sharing deployed 2026-10-17, simplified the same day (the `/l/` addresses are not deployed yet): links are `/l/<shareId>` (migration 0005; `/s/` redirects), the Share panel is Private / Anyone with the link + copy, viewers see the Steam name. A list has one address, `/l/<shareId>`: the owner's page if the list is in this browser, the shared page otherwise; `/l/<internal id>` and `/s/<shareId>` redirect. `GET /api/s/:shareId` with ETag/304, `/l/*` pages with Open Graph tags. `POST /api/handle` stays for the profile, no UI yet. Viewer page `Shared.tsx` is a lazy chunk, read-only, polls every 30 s while visible.

Next: public profile (`/u/<handle>`, "profile" visibility; ask for the handle there, labelled as the public username), copy to my backlog, optional collections import.

Production check (2026-10-17, 761-game library): callback 594 ms, import 5.3 s wall / 26 ms CPU, sync 8–14 ms CPU, cron 3–4.5 s wall / 10–14 ms CPU. All over the free plan's 10 ms CPU but none failed; watch `wrangler tail` for "exceeded CPU" (fix: Workers Paid, or paged sync and smaller batches).

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
- Restoring a backup with "replace" clears the outbox and sync cursor too (`db.clearAll`), even when signed in.
