import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { TIMED_BANDS, formatHours } from "@backlog/shared/bands";
import { parseLengthInput, type ParsedLength } from "@backlog/shared/length-input";
import type { Game } from "@backlog/shared/types";
import { lengthsFor, setMyLength } from "../store.ts";
import { ALT, hltbSearchUrl } from "../util.ts";

type Props = {
  game: Game;
  autoFocus?: boolean;
  /** Refocus the input when the window regains focus (coming back from the look-up tab). */
  refocusOnReturn?: boolean;
  onSaved?: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
};

function preview(p: ParsedLength | null, text: string): string {
  if (!text.trim()) return "";
  if (!p) return "Not a length yet";
  if (p.kind === "single") return `→ ${formatHours(p.hours)}`;
  const { main, main_extra, comp } = p.lengths;
  return `→ Main ${formatHours(main)} · Main + Extras ${formatHours(main_extra)} · Completionist ${formatHours(comp)}`;
}

/** The hours input used on cards, in the detail panel and in fill-in mode (SPEC §4). */
export function LengthEditor({ game, autoFocus, refocusOnReturn, onSaved, onSkip, onCancel }: Props) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const parsed = parseLengthInput(text);

  // Focus before paint, so keys typed right after saving the previous game aren't lost
  useLayoutEffect(() => { if (autoFocus) input.current?.focus(); }, [game.appid]);
  useEffect(() => {
    if (!refocusOnReturn) return;
    const onFocus = () => input.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refocusOnReturn]);

  const done = () => { setText(""); onSaved?.(); };
  const save = () => {
    if (!parsed) return;
    setMyLength(game.appid, parsed.kind === "single" ? lengthsFor(parsed.hours) : parsed.lengths, "exact");
    done();
  };
  const guess = (i: number) => { setMyLength(game.appid, lengthsFor(TIMED_BANDS[i].guess!), "approx"); done(); };
  const endless = () => { setMyLength(game.appid, null, "endless"); done(); };
  const lookUp = () => window.open(hltbSearchUrl(game.name), "_blank", "noopener");

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape" && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel(); }
    else if (e.key === "Tab" && !e.shiftKey && onSkip) { e.preventDefault(); onSkip(); }
    else if (e.altKey && /^Digit[1-7]$/.test(e.code)) { e.preventDefault(); guess(Number(e.code.slice(5)) - 1); }
    else if (e.altKey && e.code === "KeyN") { e.preventDefault(); endless(); }
    else if (e.altKey && e.code === "KeyO") { e.preventDefault(); lookUp(); }
  };
  // Pasted blocks keep their line breaks as spaces instead of being glued together
  const onPaste = (e: ClipboardEvent) => {
    const t = e.clipboardData?.getData("text");
    if (t && /\n/.test(t)) { e.preventDefault(); setText(t.replace(/\s+/g, " ").trim()); }
  };

  return (
    <div class="len-editor">
      <div class="len-row">
        <input ref={input} type="text" inputMode="decimal" autocomplete="off" spellcheck={false}
          aria-label={`Hours for ${game.name}`} placeholder="Hours, e.g. 12.5 or 12h30, or paste times"
          value={text} onInput={e => setText(e.currentTarget.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
        <button type="button" class="btn primary" disabled={!parsed} onClick={save}>Save</button>
        <button type="button" class="btn" onClick={lookUp} title={`Look up on HowLongToBeat (${ALT}O)`}>Look up ↗</button>
      </div>
      <div class={`len-preview${text && !parsed ? " bad" : ""}`} aria-live="polite">{preview(parsed, text)}</div>
      <div class="len-guess" role="group" aria-label="Rough guess">
        <span class="hint">Rough guess:</span>
        {TIMED_BANDS.map((b, i) => (
          <button type="button" key={b.id} class="guess" style={{ "--c": `var(${b.color})` }} onClick={() => guess(i)}
            title={`${b.label}, stored as ~${b.guess} h (${ALT}${i + 1})`}>{b.label.replace(" h and up", "+").replace(" to ", "–").replace("Under ", "<")}</button>
        ))}
        <button type="button" class="guess endless" onClick={endless} title={`No ending: sandbox, multiplayer, endless (${ALT}N)`}>No ending</button>
      </div>
      <div class="hint keys">
        <kbd>Enter</kbd> save · <kbd>{ALT}1</kbd>–<kbd>7</kbd> rough guess · <kbd>{ALT}N</kbd> no ending · <kbd>{ALT}O</kbd> look up
        {onSkip && <> · <kbd>Tab</kbd> skip</>}
      </div>
    </div>
  );
}
