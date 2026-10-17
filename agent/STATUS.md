# Status

Updated 2026-10-17. Branch: `m1-local-app` (from `spec`).

## Milestones

- [x] 0. IGDB coverage check (`TECH.md` §8)
- [x] 1. Local app + statuses. Live at https://baquelogue.com (deployed 2026-10-17, `npm run deploy`)
- [ ] 2. Speed layer: keyboard grid nav, bulk select, command palette, smart views, Now playing shelf
- [ ] 3. Accounts, Steam import, sync, IGDB cron, community lengths
- [ ] 4. Lists and sharing

## Now

Windowed shelves done (`app/src/components/Shelf.tsx`); perf check passes at 3,000 games, 4x slower CPU. Next: branch `m2-speed-layer`.

## Backlog

- Delisted apps show "Steam app 11420"; IGDB has names for some.
- Covers are blank tiles while art loads.
- Clicking an approximate badge does nothing (it catches hover for the tooltip); maybe open the detail panel.
- "Uncertain lengths" smart view (M2).
- Hashed `/assets/*` are served with `max-age=0, must-revalidate`; add a `_headers` file for long-lived caching.
- `www.baquelogue.com` doesn't resolve; redirect it if wanted.
- M2 keyboard nav: cards off screen aren't mounted; scroll a card into its row before focusing it. A focused card scrolled far away unmounts and drops focus.
