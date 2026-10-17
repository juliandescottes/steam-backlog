import { useEffect } from "preact/hooks";
import { toast, undo } from "../store.ts";
import { isMac } from "../util.ts";

const SHOWN_MS = 6000;

export function Toast() {
  const t = toast.value;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => toast.value?.id === t.id && (toast.value = null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [t?.id]);

  return (
    <div class="toast-area" aria-live="polite">
      {t && (
        <div class="toast" key={t.id}>
          <span>{t.message}</span>
          {t.undoable && <button type="button" class="btn ghost" onClick={undo} title={isMac ? "⌘Z" : "Ctrl+Z"}>Undo</button>}
        </div>
      )}
    </div>
  );
}
