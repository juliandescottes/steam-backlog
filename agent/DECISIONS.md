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
- **Lengths:** IGDB (~62% coverage), `version_parent` fallback only, plus fill-in flow and user lengths. No HLTB scraping in the product.
- **Profiles at random ids, no usernames** (2026-10-18): no conflicts or squatting to deal with; same idea as list share ids.
- **Import lengths removed** (2026-10-18): nobody would use it. Lengths imported before keep `myKind: "imported"`.
- **Community lengths off** (2026-10-18): a tool for the user and a few friends, not another source of truth; too few users to reach 3 entries anyway. Code kept behind `COMMUNITY_LENGTHS`, checkbox removed.
- **Fill-in shortcuts use Alt** (`Alt+1–7`, `Alt+N`, `Alt+O`): the input takes digits and letters.
- **Quick actions (P/F/D):** bottom-right column; hidden on touch screens.
- **Hours display:** quarters under 3 h, whole hours above, no space before the unit (`1.75h`, `113h`). Stored to the quarter hour; detail panel shows the stored value.
- **Approximate lengths:** no "~" on covers; dotted band edge plus a tooltip with the reason. Normal cursor.
- **Windowed shelves:** bands mount only rows near the screen; cards have a fixed height. Perf budget checked at 4x CPU slowdown (`npm run perf`).
- **Hosting:** one Worker with static assets (not Pages) at `baquelogue.com`; API joins it in M3. No `workers.dev` URL: local data is per origin.
- **Milestone 3 before 2**, so others can use the live app.
- **Sync ops carry field values**, not actions; last writer wins per field.
- **First sign-in merges local data** into the account (owned games only); sign-out clears the browser.
- **Share links are `/l/<random id>`**, one click to share; viewers see the Steam name. It is also the owner's list page address (owner view when the list is in the browser). The handle (`/u/<handle>`) is only for the public profile. A handle plus a slug per list was too many steps.
- **Dropped from v1:** "Copy to my backlog" on shared lists, and Steam collections import. Not important enough (a patch of the copy feature was built and not committed).

## 2026-10-18

- **Spec as numbered rules**, each cited by a test title (`tools/spec.test.ts`). Why: guard against drift as fixes pile up. Rejected: a separate spec repo (spec, test and code must change in one commit), Gherkin (ceremony).
- **Leaving Finished clears the finish date**; the date can be edited in the detail panel. Why: a game moved back to Playing shouldn't count as finished on a date.
- **Perf tests check work, not time.** `npm run e2e` asserts what's mounted and rendered; the 100 ms budget runs in `npm run perf` only. Why: timings depend on the machine, so a slower one would fail with nothing wrong.
