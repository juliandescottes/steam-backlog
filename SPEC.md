# Backlog tracker: user-facing spec

What people see and do in the app. Decisions so far: four statuses, live curated lists that can be shared, Steam sign-in, Steam games only for v1. Technical design is a separate document.

## 1. Principles
- **Instant.** Every action (status change, filter, sort, search) applies in under 100 ms with no spinner. Network sync happens in the background.
- **No confirmation dialogs.** Destructive or bulk actions show an undo toast instead.
- **Covers are the interface.** Box art grid, minimal chrome, no social features, no ads.
- **Shortest-first.** The default view answers "what can I finish soon?"

## 2. Sign-in and onboarding
1. Landing page: one sentence of pitch, a sample screenshot, a **Sign in with Steam** button.
2. After Steam sign-in, the app imports the library automatically (needs a public Steam profile; if it's private, show a short guide to making the game details public, then a Retry button).
3. Import screen shows progress ("Fetching 1,204 games… matching lengths…") and lands on the grid as soon as the first data arrives; lengths fill in progressively.
4. **Initial triage.** Games with playtime start as *Backlog* but get a "Played Xh" marker; a one-time prompt offers "Mark the N games you've played over 80% of their length as Finished?" (one click, undoable).
5. Optional: **Import Steam collections** by uploading `cloud-storage-namespace-1.json` (with instructions on where to find it). Each collection becomes a list (see §6).

Re-sync: a "Refresh library" action picks up newly bought games (they arrive as Backlog). It also runs automatically on sign-in at most once a day.

## 3. Library view (home)
- **Header:** "212 games · 3,140 h to clear", with a progress bar (finished hours / total hours).
- **Now playing shelf:** horizontal row of games with status Playing, above the grid. Hidden when empty.
- **Length bands:** like the prototype: stacked bar + legend; click a band to jump to it. Bands: <3, 3–6, 6–10, 10–20, 20–40, 40–80, 80+, Unknown.
- **Cover card:** box art, hours badge (rounded to 0.25 h, colored by band), small status chip if not Backlog, played-hours marker if any. Hover/focus reveals quick actions (Playing / Finished / Dropped / Add to list).
- **Click a cover** → detail panel (side sheet; on mobile, bottom sheet): name, art, length (Main / Main+Extras / Completionist when known), Steam playtime, status, lists it's in, personal note, links to Steam store and the length source page.
- Games with no length data sit in the **Unknown** band; the detail panel lets you enter a length manually.

## 4. Statuses
Backlog (default) · Playing · Finished · Dropped.
- Change from the card's quick actions, the detail panel, or a key: `b` backlog, `p` playing, `f` finished, `d` dropped.
- Finishing a game records the date (shown in the detail panel, used for "Finished this year" views).
- Every change shows a toast with **Undo** (also `Ctrl+Z`).

## 5. Finding and organizing
- **Search-as-you-type** (`/` focuses it) over names across the whole library.
- **Filters:** status (multi-select, default: Backlog + Playing), length range, played / never launched, date added (Steam does not expose purchase dates).
- **Sort:** length (default, shortest first), name, date added, playtime, recently changed.
- **Smart views:** a saved filter + sort with a name ("Under 5 h", "Never launched", "Finished in 2026"). A few are built in; users can save their own from the current filter state. Shown as tabs/chips under the header.
- **Keyboard:** arrow keys move focus across the grid; `Enter` opens details; `Esc` closes. `?` shows the shortcut sheet.
- **Bulk select:** click the checkbox on a card or `x` on the focused card; shift-click selects a range; `Ctrl+A` selects all visible. With a selection, status keys and "Add to list" apply to all, with one undo.
- **Command palette** (`Ctrl+K`): jump to a game, a view or a list; run actions ("Mark selection finished", "Refresh library", "Export backup").

## 6. Lists and sharing
A **list** is a named, ordered collection of games with an optional description. Two kinds:
- **Hand-picked:** you add games (from a card, the detail panel, a bulk selection, or the palette) and drag to reorder. Good for "Up next" or "Best short games I played".
- **Filter-based:** made from a smart view; its contents update as your library changes ("My backlog under 5 h").

Lists appear in a sidebar (drawer on mobile). Opening one shows the same grid UI scoped to that list.

**Sharing**
- Each list is **Private** by default. Toggle to **Shared (anyone with the link)** to get a link like `/u/<name>/l/<slug>`. Option to also show it on your public profile.
- Shared lists are **live**: changes appear for viewers within seconds, no re-publish.
- The viewer page is read-only, needs no sign-in, and shows the owner's name, list title and description, the cover grid with lengths and the owner's status chips, and the total hours. Viewers can filter/sort within the list.
- Signed-in viewers get an extra action: **Copy to my backlog** (marks which games they already own).
- **Public profile** `/u/<name>`: avatar, display name, optional summary stats (games finished, hours cleared), and the lists the owner chose to show. Off by default.
- Owner controls per list: rename, change slug, make private again (link stops working immediately), delete (with undo).

## 7. Data ownership
- **Export:** JSON backup of statuses, notes, manual lengths, lists and views (Settings and the palette).
- **Import:** restore from that JSON (merge or replace, with a summary before applying).
- **Delete account:** removes all server data; the export is offered first.

## 8. Settings
Theme (system / dark / light) · default length measure (Main / Main+Extras, default: Main+Extras) · Steam profile link · profile visibility · export/import · sign out · delete account.

## 9. Platforms
Desktop and mobile web (phone width ~400 px is a first-class layout). Works offline for your own library after first load; changes sync when back online. Shared list pages need a connection.

## 10. Out of scope for v1
Non-Steam games and manual game entry, wishlist, On hold status, ratings/reviews, social feeds/follows/comments, editable collaborative lists, native apps.

## Open questions

- Length data source: IGDB time-to-beat coverage vs HLTB for this library. The Unknown band covers gaps meanwhile.
- Whether viewers of a shared list see the owner's per-game notes. Proposal: no, notes stay private.
