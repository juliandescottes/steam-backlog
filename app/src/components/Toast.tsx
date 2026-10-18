import { useEffect } from "preact/hooks";
import { sharePath } from "@backlog/shared/share";
import { navigate, route } from "../route.ts";
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
  const r = route.value;
  const link = t?.link && !(r.page === "list" && t.link.href === sharePath(r.shareId)) ? t.link : null; // not to the list already shown

  return (
    <div class="toast-area" aria-live="polite">
      {t && (
        <div class="toast" key={t.id}>
          <span>{t.message}</span>
          {link && <a class="btn ghost" href={link.href} onClick={e => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            toast.value = null;
            navigate(link.href);
          }}>{link.label}</a>}
          {t.undoable && <button type="button" class="btn ghost" onClick={undo} title={isMac ? "⌘Z" : "Ctrl+Z"}>Undo</button>}
        </div>
      )}
    </div>
  );
}
