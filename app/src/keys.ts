import { move, type Direction } from "@backlog/shared/grid";
import type { Status } from "@backlog/shared/types";
import {
  canReorder, clearSelection, currentList, editingId, fillInQueue, focusTarget, games, moveInList, openId, paletteOpen, pickerFor,
  selectAll, selection, setStatus, settingsOpen, shelves, shortcutsOpen, toggleSelected, undo, viewing, visible,
} from "./store.ts";
import { inTextField } from "./util.ts";

const STATUS_KEYS: Record<string, Status> = { b: "backlog", p: "playing", f: "finished", d: "dropped" };

/** The game under keyboard focus: a focused card, or the open detail panel. */
function focusedGame(): number | null {
  const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-appid]");
  if (card) return Number(card.dataset.appid);
  return openId.value;
}

const ARROWS: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** Card under focus, or the last one focused when it scrolled away and unmounted, or the first one on screen. */
let lastCard: number | null = null;
function startCard(): number | null {
  const id = focusedGame();
  if (id != null) return id;
  if (lastCard != null && shelves.value.some(s => s.entries.some(e => e.game.appid === lastCard))) return lastCard;
  const toolbar = document.querySelector(".tools")?.getBoundingClientRect().bottom ?? 0;
  const first = [...document.querySelectorAll<HTMLElement>(".game")].find(c => c.getBoundingClientRect().top >= toolbar);
  return first ? Number(first.dataset.appid) : null;
}

function moveFocus(dir: Direction) {
  const from = startCard();
  if (from == null) return;
  const onCard = focusedGame() === from && document.activeElement?.closest("[data-appid]");
  const cols = getComputedStyle(document.querySelector(".shelf")!).gridTemplateColumns.split(" ").length;
  // The first press only lands on a card; later ones move
  focusTarget.value = onCard ? move(shelves.value.map(s => s.entries.map(e => e.game.appid)), cols, from, dir) : from;
}

export function installKeys() {
  document.addEventListener("focusin", e => {
    const card = (e.target as HTMLElement).closest?.<HTMLElement>("[data-appid]");
    if (card) lastCard = Number(card.dataset.appid);
  });

  window.addEventListener("keydown", e => {
    if (fillInQueue.value) return; // fill-in mode handles its own keys
    if (viewing.value) return; // someone else's list: nothing to act on
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
    if (e.key === "Escape") {
      if (paletteOpen.value) paletteOpen.value = false;
      else if (pickerFor.value) pickerFor.value = null;
      else if (shortcutsOpen.value) shortcutsOpen.value = false;
      else if (editingId.value != null) editingId.value = null;
      else if (openId.value != null) openId.value = null;
      else if (settingsOpen.value) settingsOpen.value = false;
      else if (selection.value.size) clearSelection();
      return;
    }
    if (inTextField(e)) return;
    if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    const inPanel = openId.value != null || settingsOpen.value || shortcutsOpen.value || paletteOpen.value || !!pickerFor.value;
    if (mod && !e.shiftKey && e.key.toLowerCase() === "a" && !inPanel) { e.preventDefault(); selectAll(); return; }
    // Alt+←/→ moves the focused game within a hand-picked list
    if (e.altKey && !mod && (e.key === "ArrowLeft" || e.key === "ArrowRight") && canReorder.value && !inPanel) {
      const id = focusedGame();
      const order = visible.value.map(x => x.game.appid);
      const i = id == null ? -1 : order.indexOf(id);
      const target = order[i + (e.key === "ArrowLeft" ? -1 : 1)];
      if (i < 0 || target == null) return;
      e.preventDefault();
      moveInList(currentList.value!.id, id!, target, e.key === "ArrowLeft" ? "before" : "after");
      focusTarget.value = id;
      return;
    }
    if (mod || e.altKey) return;

    if (e.key === "?") { e.preventDefault(); shortcutsOpen.value = !shortcutsOpen.value; return; }
    const dir = ARROWS[e.key];
    if (dir && !e.shiftKey && openId.value == null && !settingsOpen.value && !shortcutsOpen.value && editingId.value == null) {
      e.preventDefault();
      moveFocus(dir);
      return;
    }
    if (e.key === "/") { e.preventDefault(); document.getElementById("search")?.focus(); return; }
    const id = focusedGame();
    if (e.key.toLowerCase() === "x" && id != null && openId.value == null) { e.preventDefault(); toggleSelected(id, e.shiftKey); return; }
    if (e.key.toLowerCase() === "a" && !inPanel) {
      const ids = selection.value.size ? [...selection.value] : id != null ? [id] : [];
      if (ids.length) { e.preventDefault(); pickerFor.value = ids; if (selection.value.size) clearSelection(); }
      return;
    }
    if (e.key.toLowerCase() === "a" && openId.value != null && id != null && !pickerFor.value) { e.preventDefault(); pickerFor.value = [id]; return; }
    const status = STATUS_KEYS[e.key.toLowerCase()];
    if (!status) return;
    // With a selection, status keys apply to all of it (one undo)
    if (selection.value.size && !inPanel) { e.preventDefault(); setStatus([...selection.value], status); clearSelection(); return; }
    if (id != null && games.value.has(id)) { e.preventDefault(); setStatus([id], status); }
  });
}
