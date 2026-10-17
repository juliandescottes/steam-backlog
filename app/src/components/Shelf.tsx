import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Entry } from "@backlog/shared/filter";
import { editingId, focusTarget } from "../store.ts";
import { Card } from "./Card.tsx";

const OVERSCAN = 1; // viewport heights rendered above and below the screen

type Rows = { cols: number; pitch: number; gap: number; start: number; end: number };

/**
 * Rows of the shelf to render. Every card has the same height (2:3 cover, fixed text block),
 * so row positions follow from the column width and only rows near the viewport are mounted.
 */
function rowsFor(el: HTMLElement, count: number, prev: Rows | null): Rows {
  const cs = getComputedStyle(el);
  const tracks = cs.gridTemplateColumns.split(" ");
  const gap = parseFloat(cs.rowGap) || 0;
  const pitch = parseFloat(tracks[0]) * 1.5 + parseFloat(cs.getPropertyValue("--card-text")) + gap;
  const cols = tracks.length;
  // First pass: lay out spacers only, so shelves further down measure their real position
  if (!prev) return { cols, pitch, gap, start: 0, end: 0 };
  const top = el.getBoundingClientRect().top;
  const vh = window.innerHeight;
  const rows = Math.ceil(count / cols);
  const start = Math.min(rows, Math.max(0, Math.floor((-top - OVERSCAN * vh) / pitch)));
  const end = Math.min(rows, Math.max(start, Math.ceil(((1 + OVERSCAN) * vh - top) / pitch)));
  return { cols, pitch, gap, start, end };
}

const same = (a: Rows | null, b: Rows) =>
  !!a && a.cols === b.cols && a.pitch === b.pitch && a.start === b.start && a.end === b.end;

export function Shelf({ list }: { list: Entry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const update = useRef(() => {});
  update.current = () => {
    if (!ref.current) return;
    const next = rowsFor(ref.current, list.length, rows);
    if (!same(rows, next)) setRows(next);
  };

  useLayoutEffect(() => update.current());

  // Keyboard focus on a card of this shelf: scroll its row into view first if it isn't mounted
  const target = focusTarget.value;
  useLayoutEffect(() => {
    if (target == null || !rows || !ref.current) return;
    const i = list.findIndex(e => e.game.appid === target);
    if (i < 0) return;
    const cover = ref.current.querySelector<HTMLElement>(`[data-appid="${target}"] .cover`);
    if (cover) {
      cover.focus({ preventScroll: true });
      cover.closest(".game")!.scrollIntoView({ block: "nearest" });
      focusTarget.value = null;
    } else {
      const rowTop = ref.current.getBoundingClientRect().top + Math.floor(i / rows.cols) * rows.pitch;
      window.scrollBy(0, rowTop - window.innerHeight / 3);
      update.current();
    }
  }, [target, rows, list]);

  useEffect(() => {
    let frame = 0;
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update.current(); });
    };
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  const editing = editingId.value;
  const r = rows ?? { cols: 1, pitch: 0, gap: 0, start: 0, end: 0 };
  const total = Math.ceil(list.length / r.cols);
  const spacer = (key: string, n: number) => n > 0 && <div key={key} class="shelf-spacer" style={{ height: `${n * r.pitch - r.gap}px` }} />;

  return (
    <div class="shelf" ref={ref}>
      {spacer("above", r.start)}
      {list.slice(r.start * r.cols, r.end * r.cols).map(e => <Card key={e.game.appid} e={e} editing={editing === e.game.appid} />)}
      {spacer("below", total - r.end)}
    </div>
  );
}
