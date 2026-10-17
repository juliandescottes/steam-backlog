# Backlog tracker

Local-first game backlog tracker: Steam games, shortest first. Speed and low friction are the product.

Read first: `agent/STATUS.md` (where we are), then as needed `SPEC.md` (product), `TECH.md` (architecture), `agent/DECISIONS.md`, `agent/UI.md`, `agent/RESEARCH.md`.

## Commands

```
npm run dev        # app, http://localhost:5190
npm run dev:api    # Worker + local D1 on 8790 (Vite proxies /api); dev sign-in, fake Steam library
npm test           # vitest, shared/ and worker/
npm run e2e        # playwright, installed Chrome; starts both servers
npm run typecheck
npm run build
npm run library    # tools/out/library.json + hltb_lengths.json from prototype data
npm run deploy     # build + wrangler deploy to baquelogue.com (ask first)
```

## Layout

- `app/`: Preact + Vite + @preact/signals. State in `src/store.ts`, IndexedDB in `src/db.ts`.
- `shared/`: code the client and Worker share (lengths, bands, input parsing, filters, file formats, sync protocol). Unit-tested.
- `worker/`: Cloudflare Worker: API in `src/`, D1 schema in `migrations/`. Account and sync client in `app/src/account.ts`.
- `e2e/`: Playwright. Blocks Steam's CDN; fixtures in `e2e/fixtures/`.
- `tools/`: prototype scripts, data, IGDB coverage check.

## Conventions

- TypeScript everywhere, imports with `.ts`/`.tsx` extensions. Node 23.6+ runs `tools/*.ts` directly.
- Match surrounding style; keep comments sparse.
- After UI changes: run unit + e2e tests, then check in the browser (Firefox MCP) and measure, don't eyeball.
- Commit only when asked. One branch per milestone.

## Gotchas

- Monospace fonts render U+202F as wide as a normal space.
- CSS ids starting with a digit (band ids like `10-20`) need `[id="10-20"]`.
- Focus inputs in `useLayoutEffect`, not `useEffect`, or fast keystrokes are lost.
- Strip ™®© before `normalize("NFKD")`, which turns ™ into "TM".
- Write regexes with `\u` escapes, not literal combining chars or BOM.
- Firefox MCP upload doesn't reach hidden file inputs: fetch the file via `/@fs/<abs path>` in the dev server and set `input.files` with a DataTransfer.
- Firefox MCP hover doesn't trigger `:hover`; inject a style to force states.
