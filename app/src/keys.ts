import type { Status } from "@backlog/shared/types";
import { editingId, fillInQueue, games, openId, setStatus, settingsOpen, undo } from "./store.ts";
import { inTextField } from "./util.ts";

const STATUS_KEYS: Record<string, Status> = { b: "backlog", p: "playing", f: "finished", d: "dropped" };

/** The game under keyboard focus: a focused card, or the open detail panel. */
function focusedGame(): number | null {
  const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-appid]");
  if (card) return Number(card.dataset.appid);
  return openId.value;
}

export function installKeys() {
  window.addEventListener("keydown", e => {
    if (fillInQueue.value) return; // fill-in mode handles its own keys
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === "Escape") {
      if (editingId.value != null) editingId.value = null;
      else if (openId.value != null) openId.value = null;
      else if (settingsOpen.value) settingsOpen.value = false;
      return;
    }
    if (inTextField(e)) return;
    if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;

    if (e.key === "/") { e.preventDefault(); document.getElementById("search")?.focus(); return; }
    const status = STATUS_KEYS[e.key.toLowerCase()];
    const id = status && focusedGame();
    if (status && id != null && games.value.has(id)) { e.preventDefault(); setStatus([id], status); }
  });
}
