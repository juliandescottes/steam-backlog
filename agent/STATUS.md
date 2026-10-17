# Status

Updated 2026-10-17. Branch: `m2-speed-layer` (from `m3-accounts-sync`).

## Milestones

- [x] 0. IGDB coverage check (`TECH.md` §8)
- [x] 1. Local app + statuses. Live at https://baquelogue.com (deployed 2026-10-17, `npm run deploy`)
- [ ] 2. Speed layer: keyboard grid nav, bulk select, command palette, smart views, Now playing shelf
- [x] 3. Accounts, Steam import, sync, IGDB cron, community lengths, triage prompt, account deletion. Live 2026-10-17 (D1 `baquelogue`, secrets set, cron every minute)
- [ ] 4. Lists and sharing (+ optional Steam collections import, moved from 3 on 2026-10-17)

## Now

Milestone 2. M3 was done first (decided 2026-10-17).

Done: keyboard grid nav (`shared/grid.ts`, `focusTarget` scrolls unmounted cards into view), `?` shortcut sheet.

Next: bulk select, command palette, smart views, Now playing shelf.

Production check (2026-10-17, 761-game library): callback 594 ms, import 5.3 s wall / 26 ms CPU, sync 8–14 ms CPU, cron 3–4.5 s wall / 10–14 ms CPU. All over the free plan's 10 ms CPU but none failed; watch `wrangler tail` for "exceeded CPU" (fix: Workers Paid, or paged sync and smaller batches).

## Backlog

- Triage marks all candidates at once (125 on the real library, some fighting games among them); maybe a "Review them" view.
- No preview deployments per branch yet (TECH §12).
- Delisted apps show "Steam app 11420"; IGDB has names for some.
- Covers are blank tiles while art loads.
- Clicking an approximate badge does nothing (it catches hover for the tooltip); maybe open the detail panel.
- "Uncertain lengths" smart view (M2).
- A focused card scrolled far away by mouse unmounts and drops focus; arrows resume from it.
