# Backlog

A fast, local-first game backlog tracker: your Steam games, shortest first. See `SPEC.md` for what it does and `TECH.md` for how it's built. Working notes for agents are in `CLAUDE.md` and `agent/`.

## Development

Needs Node 23.6+ (the scripts in `tools/` run TypeScript directly).

```
npm install
npm run dev          # app at http://localhost:5190
npm test             # unit tests (shared/)
npm run e2e          # browser tests (Playwright, uses the installed Chrome)
npm run typecheck
npm run build        # static site in app/dist
```

Until Steam import exists (milestone 3), the app opens a library file. `npm run library` builds one from the prototype data:

- `tools/out/library.json`: open it on the first screen. Uses IGDB lengths from `tools/igdb_results.json` when present (made by `tools/igdb_coverage.ts`).
- `tools/out/hltb_lengths.json`: Settings → Import lengths, to use the prototype's HLTB times as your own.

## Layout

- `app/`: Preact + Vite client
- `shared/`: code shared with the future Worker: types, length bands and resolution, length input parsing, filters, file formats
- `e2e/`: Playwright tests
- `tools/`: prototype scripts and data
- `backlog/`: the prototype page
