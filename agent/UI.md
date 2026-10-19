# UI conventions

Layout and structure in `app/src/styles.css`; the Malabar design over it in `app/src/malabar.css` (`<html data-design="malabar">`).

## Look

- Malabar, after the French bubble gum: 2px outlines (`--ink`), hard offset shadows (`--hard`), pill labels, flash-tattoo status chips.
- Fonts: Fredoka (headings, labels), Nunito (body), Space Mono (numbers, badges).
- Colors from a palette (`data-palette`, SET-4): Default, Bubblegum, Cottoncandy; each with a light and a dark page (`prefers-color-scheme`, `data-theme`). A palette sets every color token; the design rules only use tokens.
- One color per length band (`--b0`…`--b6`, `--bend` no ending, `--bnone` unknown). Bubblegum's bands take the page's other color: pinks by day, yellows at night. Text on a band color is `--on-c`.
- Dev only: the corner switcher (`Protos.tsx`) shows the original look and two prototypes over it.
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
