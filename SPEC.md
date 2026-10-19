# Backlog tracker: user-facing spec

What people see and do in the app. Technical design is in `TECH.md`.

Each rule has a bold ID like STATUS-4 and a test that cites it in its title, checked by `tools/spec.test.ts`. `(manual)`: checked by hand in the browser. `(planned)`: not built yet. Prose between rules is context, not contract.

## 1. Principles

- **PRIN-1** Instant: actions apply with no spinner, and sync runs in the background. The work stays proportional to what's on screen, whatever the library size: only cards near the screen are mounted, and a status change renders only the changed card.
- **PRIN-5** Speed target: on a 3,000-game library with a 4x slower CPU, search, filters and status changes render within 100 ms. Timings depend on the machine, so `npm run perf` reports them and they aren't part of `npm run e2e`. (manual)
- **PRIN-2** No confirmation dialogs: destructive and bulk actions apply at once and show a toast with **Undo**. Exceptions: deleting the account or the local data asks first, and restoring a backup shows what it holds before applying.
- **PRIN-3** Covers are the interface: box art grid, minimal chrome, no social features, no ads. (manual)
- **PRIN-4** Shortest first: the library opens on the "To play" view (Backlog + Playing), grouped by length band, shortest first.

## 2. Sign-in and onboarding

- **ONB-1** The welcome page offers **Sign in with Steam**. Without an account, a library file or a backup dropped on the page opens (no visible control: for local use and tests).
- **ONB-2** After Steam sign-in, the library is imported automatically.
- **ONB-3** When the Steam profile's game details are private, the import says so, explains how to make them public, and offers Retry.
- **ONB-4** Games without an IGDB length get one as soon as the server finds it after an import; sync brings it to the browser.
- **ONB-5** Cards of played games show "Played Xh". While any Backlog game played for at least 80% of its length is unanswered, the library offers to mark them Finished: **Mark Finished**, **Review…** or **No thanks**, one undo. An answer is per game and syncs: a declined game isn't offered again; a game newly past 80% is.
- **ONB-10** **Review…** lists those games, checked, to uncheck some: checked ones become Finished, unchecked ones stay in the Backlog as declined.
- **ONB-11** "Review finished games" in the palette opens the same review any time, with every Backlog game past 80%; declined ones start unchecked.
- **ONB-6** Refresh library (Settings, palette) adds newly bought games as Backlog and keeps everything the user set.
- **ONB-7** Signing in refreshes the library when the last import is more than a day old. (manual)
- **ONB-8** On first sign-in, what was done in this browser (statuses, notes, lengths, views, lists) moves into the account, for owned games only.
- **ONB-9** Signing out clears this browser. Another account signing in on the same browser gets only its own library.

## 3. Library view (home)

- **LIB-1** Header: "N games, H hours to clear" over Backlog + Playing, and the games finished with the share of hours cleared (finished hours over finished + remaining). Signed in, it adds when the library last synced from Steam.
- **LIB-2** Now playing shelf, off by default (Settings): a row of Playing games above the grid, most recently changed first, shown whatever the view's statuses, hidden when empty.
- **LIB-3** Length bands: Under 3 h, 3–6, 6–10, 10–20, 20–40, 40–80, 80 h and up, No ending, Unknown. Sorted by length, games are grouped by band, with a stacked bar and a legend that link to each band.
- **LIB-4** Hours badges show quarter hours under 3 h (`1.75h`), whole hours above (`113h`), no space before the unit, colored by band. Stored to the quarter hour.
- **LIB-5** Approximate lengths have a dotted band edge and a tooltip with the reason; no "~" on covers.
- **LIB-6** A card shows a status chip when not Backlog. Hover or focus reveals quick actions: P / F / D set Playing / Finished / Dropped, pressed again they go back to Backlog; + adds to a list.
- **LIB-7** Quick actions are hidden on touch screens. (manual)
- **LIB-8** Clicking a cover opens the detail panel: name, art, Steam and HowLongToBeat links, status, length with its source, Steam playtime, date added, finish date, lists, and a private note. Changes persist across reloads.

## 4. Missing lengths

IGDB has no time for a large share of most libraries (38% of the prototype collection), so filling in lengths is a core flow. Goal: a few seconds per game.

- **LEN-1** The Unknown band header shows its count and a **Fill in lengths** button.
- **LEN-2** A built-in "Needs a length" view lists open games without a length.
- **LEN-3** After the first import, when more than 10 games lack a length, onboarding offers to fill them in. (planned)
- **LEN-4** Fill-in mode shows one game at a time: cover, name, Steam playtime, a progress counter and a focused hours input. Played games come first, then by name. It also runs on a selection.
- **LEN-5** The hours input accepts `12`, `12.5`, `12,5`, `12½`, `12h30`, `12:30`, `45m` and similar, and rounds to the quarter hour. `Enter` saves and moves to the next game.
- **LEN-6** Pasting the times block from a game page (Main Story / Main + Extras / Completionist) fills all three measures at once.
- **LEN-7** `Alt+1`–`Alt+7` store a rough guess: the band's typical value, marked approximate.
- **LEN-8** `Alt+N` marks a game as having no ending: it moves to the No ending band and leaves the hours totals.
- **LEN-9** `Alt+O` opens the HowLongToBeat search for the game in a new tab; coming back puts focus in the input. (manual)
- **LEN-10** `Tab` skips; a skipped game comes back once, at the end. `Esc` exits; saved lengths stay.
- **LEN-11** On a card in the Unknown band, the `?` badge opens an inline editor with the same input and paste.
- **LEN-12** The user's own length wins over IGDB and community lengths. The detail panel edits it, can remove it, and names the source: IGDB (with the number of submissions), Community, Yours, or Approximate.
- **LEN-13** IGDB times with fewer than 3 submissions are approximate.
- **LEN-15** Community lengths are off (a server switch, `COMMUNITY_LENGTHS`): nothing is recorded and none are shown. When on: lengths the user types, and the Steam playtime of games they finish, are shared anonymously, unless the user turned sharing off (which removes them). Rough guesses and imported lengths are never shared; un-finishing takes the playtime back.
- **LEN-16** When community lengths are on, once a game has 3 or more community entries, other users see their median, labeled Community.

## 5. Statuses

Backlog (default) · Playing · Finished · Dropped.

- **STATUS-1** Games arrive as Backlog.
- **STATUS-2** `b` / `p` / `f` / `d` on the focused card set Backlog / Playing / Finished / Dropped.
- **STATUS-3** The card's quick actions and the detail panel set the status too.
- **STATUS-4** Finishing records the date, shown in the detail panel and used by "Finished in…" views. Leaving Finished clears it; finishing again records a new one.
- **STATUS-5** Every change shows a toast with **Undo**; `Ctrl/⌘+Z` does the same. Undo restores the previous status and finish date.
- **STATUS-6** The detail panel can change the finish date of a finished game, with undo.

## 6. Finding and organizing

- **FIND-1** Search as you type over names across the library; `/` focuses the search.
- **FIND-2** Status chips filter the grid (default Backlog + Playing), and so does played / never launched.
- **FIND-3** Other conditions a view sets (length range, finish dates, missing length) show as pills under the toolbar; removing a pill drops that condition.
- **FIND-4** Length range and date added can be set from the toolbar. (planned)
- **FIND-5** Sort by length (default, shortest first, unknown last), name, date added, playtime, or recently changed.
- **FIND-6** Smart views: built-in "To play", "Under 5 h", "Never launched", "Needs a length", "Finished in <year>"; save the current filter and sort under a name; delete with undo. Shown as tabs under the header.
- **FIND-7** Arrow keys move focus across the grid and between bands, scrolling to games far away; `Enter` opens details; `Esc` closes and returns focus to the card; `?` shows the shortcut sheet.
- **FIND-8** Bulk select: the card's checkbox or `x`, shift-click for a range, `Ctrl/⌘+A` for all shown. While selecting, clicking a cover selects. Status keys and the selection bar apply to all with one undo, then the selection clears.
- **FIND-9** Command palette (`Ctrl/⌘+K`): jump to a game, a view or a list, or run an action (statuses for the selection, sort, export, refresh, theme…).

## 7. Lists and sharing

A list is a named, ordered collection of games with an optional description, hand-picked or filter-based.

- **LIST-1** Backlog and Lists are the user's two pages, linked at the top left of each. The Lists page (`/lists`) shows every list as a card (first covers, size, hours, auto or shared) and a field to create one, empty or from the Backlog's current view.
- **LIST-2** Hand-picked lists: add games from a cover's +, `A`, the detail panel, a selection or the palette. The picker finds a list or creates one from the typed name; the toast links to the list. Games keep the order they were added in.
- **LIST-3** Reorder a hand-picked list by dragging or `Alt+←/→`, with undo. Remove games from the selection bar or the detail panel.
- **LIST-4** A list page shows title, description, size and hours, with its own status chips and sort ("List order" for hand-picked lists). Finished games stay in the list.
- **LIST-5** A filter-based list is made from the current view and updates as the library changes.
- **LIST-6** Title and description are edited in place (a pen next to each; Enter saves, Escape cancels, nothing moves). Delete a list with undo.
- **LIST-7** A list has one address, `/l/<share id>`: the owner's page in their browser, the shared page for others. Older `/l/<list id>` and `/s/<share id>` addresses redirect; an unknown one says "List not found".
- **LIST-8** Lists, their games and order sync between devices.
- **LIST-9** The owner's list page always shows its Visibility: Private (the default) or Public, visible to anyone with the link, with a copy-link button. Public needs an account.
- **LIST-10** The shared page is read-only and needs no sign-in: the owner's Steam name, title, description, games in order with lengths and the owner's statuses, and the total. Viewers filter by status and sort. Notes, playtime and dates never leave the owner's account.
- **LIST-11** The shared page refreshes every 30 s while visible and when it comes back into view; an unchanged list costs a 304.
- **LIST-12** Making a list private again, or deleting it, stops the link at once; viewers can't tell private from missing.
- **LIST-13** Shared and profile pages have a title and a link preview.
- **LIST-14** Public profile `/u/<profile id>`: off by default; the address is a random id, nothing to choose. Shows the Steam name and avatar, stats (games finished, hours cleared) and the user's public lists.
- **LIST-15** Optionally the profile shows the whole library at `/u/<profile id>/backlog`: read-only, starting on Backlog + Playing. Turning the profile off hides both pages.
- **LIST-16** Signed in, the library header welcomes the user by Steam name and says whether the profile is public. Public: "Your profile is public at" its address as a link, and a copy icon. Private: a link to the sharing settings.

## 8. Data ownership

- **DATA-1** Export backup (Settings, palette): a JSON file of statuses and dates, notes, the user's lengths, answers to the finished-games offer, views and lists.
- **DATA-2** Restore backup shows a summary of the file, then merges it into the library or replaces it.
- **DATA-3** Delete account offers a backup first, then removes all server data, community entries included. Signing in again starts empty.
- **DATA-4** Without an account, "Delete local data" removes everything from this browser after asking.

## 9. Sync

- **SYNC-1** Signed in, changes show up on the user's other devices within seconds.
- **SYNC-2** The last change to a field wins; a retried change is not applied twice.
- **SYNC-3** Users only see and change their own games, views and lists.

## 10. Settings

- **SET-1** Theme: system, dark or light. (manual)
- **SET-2** Length measure for sorting and totals: Main + Extras (default) or Main story.
- **SET-3** A link to the user's Steam profile. (planned)
- **SET-4** Colors: Default, Bubblegum or Cottoncandy, each with a light and a dark page. Kept across reloads.

Settings also holds the account, public profile, backup and delete controls covered above.

## 11. Platforms

- **PLAT-1** Phone width (~400 px) is a first-class layout: no horizontal scrolling.
- **PLAT-2** On phones: three cover columns, a toolbar that doesn't stick, the detail panel and Settings as bottom sheets, list cards in one column. (manual)
- **PLAT-3** After the first load, the own library works offline; changes made offline sync when back online. (planned)
- **PLAT-4** Shared and profile pages need a connection and retry by themselves. (manual)

## 12. Out of scope for v1

Non-Steam games and manual game entry, wishlist, On hold status, ratings and reviews, social feeds, follows and comments, collaborative lists, native apps, copying someone else's list, Steam collections import.
