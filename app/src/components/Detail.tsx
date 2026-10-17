import { useEffect, useRef, useState } from "preact/hooks";
import { formatHours } from "@backlog/shared/bands";
import { SOURCE_LABEL } from "@backlog/shared/lengths";
import { STATUSES, STATUS_LABEL } from "@backlog/shared/types";
import { approxReason } from "../lengthText.ts";
import { byId, openId, setMyLength, setStatus, settings, updateQuietly } from "../store.ts";
import { date, hltbSearchUrl, playtime, steamUrl } from "../util.ts";
import { Art } from "./Art.tsx";
import { LengthEditor } from "./LengthEditor.tsx";

export function Detail() {
  const e = byId.value.get(openId.value!);
  const close = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => opener?.focus?.();
  }, []);
  useEffect(() => setEditing(false), [openId.value]);
  if (!e) return null;

  const { game: g, len } = e;
  const unknown = len.hours == null && !len.endless;
  const source = !len.source ? null
    : len.approx ? `Approximate · ${approxReason(e, settings.value.measure)}`
    : [SOURCE_LABEL[len.source], len.source === "igdb" && g.igdb?.count != null && `${g.igdb.count} submissions`].filter(Boolean).join(" · ");

  return (
    <div class="sheet-backdrop" onClick={ev => ev.target === ev.currentTarget && (openId.value = null)}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button ref={close} type="button" class="btn ghost close" onClick={() => (openId.value = null)} aria-label="Close">✕</button>
        <div class="detail-head">
          <div class={`cover detail-cover${g.portrait === false ? " wide" : ""}`}><Art game={g} eager /></div>
          <div>
            <h2 id="detail-title">{g.name}</h2>
            <p class="links">
              <a href={steamUrl(g.appid)} target="_blank" rel="noopener">Steam ↗</a>
              <a href={hltbSearchUrl(g.name)} target="_blank" rel="noopener">HowLongToBeat ↗</a>
            </p>
          </div>
        </div>

        <div class="segmented" role="group" aria-label="Status">
          {STATUSES.map(s => (
            <button type="button" key={s} aria-pressed={g.status === s} onClick={() => setStatus([g.appid], s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>

        <section class="detail-section">
          <h3>Length</h3>
          <p class="big-len">{len.endless ? "No ending" : unknown ? "Unknown" : formatHours(len.hours, len.approx, true)}
            {source && <span class="source">{source}</span>}</p>
          {len.lengths && (
            <dl class="len-table">
              <div><dt>Main story</dt><dd>{formatHours(len.lengths.main, false, true)}</dd></div>
              <div><dt>Main + Extras</dt><dd>{formatHours(len.lengths.main_extra, false, true)}</dd></div>
              <div><dt>Completionist</dt><dd>{formatHours(len.lengths.comp, false, true)}</dd></div>
            </dl>
          )}
          {unknown || editing
            ? <LengthEditor game={g} autoFocus={editing} onSaved={() => setEditing(false)} onCancel={editing ? () => setEditing(false) : undefined} />
            : <p class="row-actions">
                <button type="button" class="btn" onClick={() => setEditing(true)}>Edit length</button>
                {(g.my || g.myKind) && <button type="button" class="btn ghost" onClick={() => setMyLength(g.appid, null, null)}>{g.igdb ? "Use the IGDB length" : "Remove my length"}</button>}
              </p>}
        </section>

        <section class="detail-section">
          <dl class="facts">
            <div><dt>Steam playtime</dt><dd>{g.playtimeMin ? playtime(g.playtimeMin) : "Never launched"}</dd></div>
            <div><dt>Added</dt><dd>{date(g.addedAt)}</dd></div>
            {g.finishedAt && <div><dt>Finished</dt><dd>{date(g.finishedAt)}</dd></div>}
          </dl>
        </section>

        <section class="detail-section">
          <label for="note"><h3>Note</h3></label>
          <textarea id="note" rows={3} placeholder="Only you can see this" value={g.note}
            onInput={ev => updateQuietly(g.appid, { note: ev.currentTarget.value }, 400)} />
        </section>
      </div>
    </div>
  );
}
