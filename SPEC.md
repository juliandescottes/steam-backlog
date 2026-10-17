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
5. Optional: **Import Steam collections** by uploading `cloud-storage-namespace-1.json` (with instructions on where to find it). Each collection becomes a list (see §7).

Re-sync: a "Refresh library" action picks up newly bought games (they arrive as Backlog). It also runs automatically on sign-in at most once a day.

## 3. Library view (home)
- **Header:** "212 games · 3,140 h to clear", with a progress bar (finished hours / total hours).
- **Now playing shelf:** horizontal row of games with status Playing, above the grid. Hidden when empty.
- **Length bands:** like the prototype: stacked bar + legend; click a band to jump to it. Bands: <3, 3–6, 6–10, 10–20, 20–40, 40–80, 80+, No ending, Unknown.
- **Cover card:** box art, hours badge (rounded to 0.25 h, colored by band), small status chip if not Backlog, played-hours marker if any. Hover/focus reveals quick actions (Playing / Finished / Dropped / Add to list).
- **Click a cover** → detail panel (side sheet; on mobile, bottom sheet): name, art, length (Main / Main+Extras / Completionist when known), Steam playtime, status, lists it's in, personal note, links to Steam store and the length source page.
- Games with no length data sit in the **Unknown** band. Filling them in is its own flow (§4).

## 4. Missing lengths
IGDB has no time for a large share of many libraries (38% of the prototype collection), so filling in lengths is a core flow, not an edge case. Goal: a few seconds per game.

**Where it shows up**
- The Unknown band header: "111 games without a length · **Fill in**". The header total notes it too ("3,140 h to clear + 111 unknown").
- After the first import, if more than 10 games lack a length, onboarding offers "Fill in lengths" (skippable).
- A built-in smart view "Needs a length", and a palette action "Fill in lengths".

**Fill-in mode.** A focused queue, one game at a time:
- Shows the cover, name, Steam playtime, a progress counter ("23 / 111"), and a focused hours input.
- **Look up** (`o`) opens the HowLongToBeat search for that name in a new tab. Coming back to the tab puts focus back in the input.
- Type the hours and press `Enter` to save and move to the next game. Accepted forms: `12`, `12.5`, `12,5`, `12½`, `12h30`, `12:30`, `45m`. Stored rounded to 0.25 h.
- **Paste a times block.** Pasting the times copied from a game page ("Main Story 8 Hours Main + Extras 12½ Hours Completionist 20 Hours") fills Main, Main + Extras and Completionist at once.
- **Rough guess.** Keys `1`–`7` pick a band (Under 3 h … 80 h and up). Stores the band's typical value, marked approximate (shown as "~6 h").
- **No ending** (`n`): for sandbox, multiplayer and endless games (Gang Beasts, Wobbledogs). They move to the No ending band and leave the hours totals.
- **Skip** (`s` or `Tab`): skipped games return at the end of the queue. `Esc` exits; progress is kept and each entry can be undone.
- Order: games with Steam playtime first, then by name. Can also run on a selection (bulk select → "Fill in lengths").

**Everywhere else**
- In the Unknown band the hours badge shows "?". Clicking it opens a small inline editor with the same input, paste and look-up.
- The detail panel can always edit the length, including overriding an IGDB time that looks wrong. It shows where the length comes from: IGDB (with the number of submissions), Community, Yours, or Approximate.
- IGDB times with fewer than 3 submissions show as approximate ("~").
- **Import lengths** (Settings): a JSON or CSV file of Steam app ID + hours, applied as your own lengths. This brings the prototype's HLTB data into your account.

**Community lengths**
- Lengths you type, and the Steam playtime of games you mark Finished, are shared anonymously to improve lengths for everyone. On by default; can be turned off in Settings. Rough guesses are never shared.
- Once a game has 3 or more community entries, other users see their median, labeled Community.

## 5. Statuses
Backlog (default) · Playing · Finished · Dropped.
- Change from the card's quick actions, the detail panel, or a key: `b` backlog, `p` playing, `f` finished, `d` dropped.
- Finishing a game records the date (shown in the detail panel, used for "Finished this year" views).
- Every change shows a toast with **Undo** (also `Ctrl+Z`).

## 6. Finding and organizing
- **Search-as-you-type** (`/` focuses it) over names across the whole library.
- **Filters:** status (multi-select, default: Backlog + Playing), length range, played / never launched, date added (Steam does not expose purchase dates).
- **Sort:** length (default, shortest first), name, date added, playtime, recently changed.
- **Smart views:** a saved filter + sort with a name ("Under 5 h", "Never launched", "Finished in 2026"). A few are built in; users can save their own from the current filter state. Shown as tabs/chips under the header.
- **Keyboard:** arrow keys move focus across the grid; `Enter` opens details; `Esc` closes. `?` shows the shortcut sheet.
- **Bulk select:** click the checkbox on a card or `x` on the focused card; shift-click selects a range; `Ctrl+A` selects all visible. With a selection, status keys and "Add to list" apply to all, with one undo.
- **Command palette** (`Ctrl+K`): jump to a game, a view or a list; run actions ("Mark selection finished", "Refresh library", "Export backup").

## 7. Lists and sharing
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

## 8. Data ownership
- **Export:** JSON backup of statuses, notes, your lengths, lists and views (Settings and the palette).
- **Import:** restore from that JSON (merge or replace, with a summary before applying).
- **Delete account:** removes all server data; the export is offered first.

## 9. Settings
Theme (system / dark / light) · default length measure (Main / Main+Extras, default: Main+Extras) · Steam profile link · profile visibility · share my lengths with the community · import lengths · export/import · sign out · delete account.

## 10. Platforms
Desktop and mobile web (phone width ~400 px is a first-class layout). Works offline for your own library after first load; changes sync when back online. Shared list pages need a connection.

## 11. Out of scope for v1
Non-Steam games and manual game entry, wishlist, On hold status, ratings/reviews, social feeds/follows/comments, editable collaborative lists, native apps.

## Open questions

- Whether viewers of a shared list see the owner's per-game notes. Proposal: no, notes stay private.
