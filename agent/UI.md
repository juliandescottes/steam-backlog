# UI conventions

Visual direction comes from the prototype (`tools/template.html`). Styles in `app/src/styles.css`.

## Look

- Dark-first, light theme via `prefers-color-scheme` and `data-theme`.
- Fonts: Big Shoulders Display (headings), Atkinson Hyperlegible (body), JetBrains Mono (numbers, badges).
- One color per length band (`--b0`…`--b6`, `--bend` no ending, `--bnone` unknown).
- Covers are the interface: 2:3 grid, wide art falls back over a blurred copy.

## Cover badges

- Hours bottom-left with a band-colored left edge. Dotted edge = approximate, reason in `title`.
- `?` badge on unknown lengths opens the inline editor.
- Status chip top-right when not Backlog.
- Badge isn't selectable.

## Interaction

- No confirmation dialogs; undo toast instead (except deleting all local data).
- Every status change: toast with Undo, also `Ctrl/⌘+Z`.
- Keys: `/` search, `b`/`p`/`f`/`d` on focused cover, `Esc` closes. Fill-in: `Enter`, `Tab`, `Alt+1–7`, `Alt+N`, `Alt+O`.
- Phone width (~400px) is a first-class layout: 3 cover columns, non-sticky toolbar, no horizontal scroll.
