# Status

Updated 2026-10-17. Branch: `m1-local-app` (from `spec`).

## Milestones

- [x] 0. IGDB coverage check (`TECH.md` §8)
- [x] 1. Local app + statuses. Live at https://baquelogue.com (deployed 2026-10-17, `npm run deploy`)
- [ ] 2. Speed layer: keyboard grid nav, bulk select, command palette, smart views, Now playing shelf
- [ ] 3. Accounts, Steam import, sync, IGDB cron, community lengths (in progress)
- [ ] 4. Lists and sharing

## Now

Milestone 3 before 2 (decided 2026-10-17), branch `m3-accounts-sync`.

Done: Worker + D1 schema, sessions, Steam OpenID, dev sign-in, library import, `/api/sync`, client outbox and sync, sign-in / import / sign-out UI. Tested locally (unit + e2e) with the dev library only.

Next: real Steam check (needs `STEAM_API_KEY`), IGDB cron, community lengths, triage prompt, collections import, account deletion, then remote D1 + secrets + deploy.

## Backlog

- Delisted apps show "Steam app 11420"; IGDB has names for some.
- Covers are blank tiles while art loads.
- Clicking an approximate badge does nothing (it catches hover for the tooltip); maybe open the detail panel.
- "Uncertain lengths" smart view (M2).
- M2 keyboard nav: cards off screen aren't mounted; scroll a card into its row before focusing it. A focused card scrolled far away unmounts and drops focus.
