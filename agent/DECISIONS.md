# Decisions

Newest last. Don't reverse these without asking.

## 2026-10-17

- **Small backend from v1**, needed to share lists. Local-first stays: UI never waits on the network.
- **Statuses:** Backlog, Playing, Finished, Dropped. No On hold or Wishlist in v1.
- **Sharing:** live curated lists (hand-picked or filter-based), viewers poll every 30 s.
- **Accounts:** Steam OpenID. Steam games only for v1.
- **Stack:** TypeScript, Preact + Vite, Cloudflare Workers + D1.
- **Covers** load from Steam's CDN; no image hosting.
- **"Date added"** instead of purchase date (Steam doesn't expose it).
- **Lengths:** IGDB (~62% coverage), `version_parent` fallback only, plus fill-in flow, user lengths and community lengths. No HLTB scraping in the product; personal HLTB data comes in as the user's own lengths.
- **Fill-in shortcuts use Alt** (`Alt+1–7`, `Alt+N`, `Alt+O`): the input takes digits and letters.
- **Quick actions (P/F/D):** bottom-right column; hidden on touch screens.
- **Hours display:** quarters under 3 h, whole hours above, no space before the unit (`1.75h`, `113h`). Stored to the quarter hour; detail panel shows the stored value.
- **Approximate lengths:** no "~" on covers; dotted band edge plus a tooltip with the reason. Normal cursor.
- **Windowed shelves:** bands mount only rows near the screen; cards have a fixed height. Perf budget checked at 4x CPU slowdown (`e2e/perf.spec.ts`).
- **Hosting:** one Worker with static assets (not Pages) at `baquelogue.com`; API joins it in M3. No `workers.dev` URL: local data is per origin.
- **Milestone 3 before 2**, so others can use the live app.
- **Sync ops carry field values**, not actions; last writer wins per field.
- **First sign-in merges local data** into the account (owned games only); sign-out clears the browser.
- **Share links are `/l/<random id>`**, one click to share; viewers see the Steam name. It is also the owner's list page address (owner view when the list is in the browser). The handle (`/u/<handle>`) is only for the public profile. A handle plus a slug per list was too many steps.
