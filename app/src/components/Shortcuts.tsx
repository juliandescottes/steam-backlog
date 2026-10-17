import { useEffect, useRef } from "preact/hooks";
import { shortcutsOpen } from "../store.ts";
import { isMac } from "../util.ts";

const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: [string, [keys: string[], what: string][]][] = [
  ["Library", [
    [["←", "→", "↑", "↓"], "Move between games"],
    [["Enter"], "Open details"],
    [["/"], "Search"],
    [["Esc"], "Close"],
  ]],
  ["Selection", [
    [["X"], "Select the focused game"],
    [["Shift", "X"], "Select up to the focused game"],
    [[MOD, "A"], "Select all shown"],
    [["Esc"], "Clear the selection"],
  ]],
  ["Status of the focused game, or the selection", [
    [["B"], "Backlog"], [["P"], "Playing"], [["F"], "Finished"], [["D"], "Dropped"],
    [[MOD, "Z"], "Undo"],
  ]],
  ["Typing a length", [
    [["Enter"], "Save, next game"],
    [["Alt", "1–7"], "Rough guess by band"],
    [["Alt", "N"], "No ending"],
    [["Tab"], "Skip"],
  ]],
];

export function Shortcuts() {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div class="modal-backdrop" onClick={ev => ev.target === ev.currentTarget && (shortcutsOpen.value = false)}>
      <div class="modal shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div class="fill-top">
          <h2 id="shortcuts-title">Shortcuts</h2>
          <button ref={close} type="button" class="btn ghost" onClick={() => (shortcutsOpen.value = false)} aria-label="Close">Esc ✕</button>
        </div>
        {GROUPS.map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {rows.map(([keys, what]) => (
                <div key={what}>
                  <dt>{keys.map((k, i) => <span key={k}>{i > 0 && (keys.length > 2 ? " " : " + ")}<kbd>{k}</kbd></span>)}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
