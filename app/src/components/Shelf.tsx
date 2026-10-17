import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Entry } from "@backlog/shared/filter";
import { editingId, focusTarget, selection } from "../store.ts";
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

type Reorder = (appid: number, target: number, side: "before" | "after") => void;
type Drop = { appid: number; side: "before" | "after" };

/** With `reorder`, cards can be dragged to a new place (a hand-picked list in its own order). */
export function Shelf({ list, reorder }: { list: Entry[]; reorder?: Reorder }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const dragged = useRef<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
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

  const cardOf = (e: Event) => (e.target as HTMLElement).closest?.<HTMLElement>("[data-appid]");
  const drag = reorder && {
    onDragStart: (e: DragEvent) => {
      const card = cardOf(e);
      if (!card) return;
      dragged.current = Number(card.dataset.appid);
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", card.dataset.appid!);
    },
    onDragOver: (e: DragEvent) => {
      const card = cardOf(e);
      if (dragged.current == null || !card) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const next: Drop = { appid: Number(card.dataset.appid), side: e.clientX > r.left + r.width / 2 ? "after" : "before" };
      if (next.appid !== drop?.appid || next.side !== drop.side) setDrop(next);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragged.current != null && drop) reorder(dragged.current, drop.appid, drop.side);
      dragged.current = null;
      setDrop(null);
    },
    onDragEnd: () => { dragged.current = null; setDrop(null); },
  };

  const editing = editingId.value;
  const selected = selection.value;
  const r = rows ?? { cols: 1, pitch: 0, gap: 0, start: 0, end: 0 };
  const total = Math.ceil(list.length / r.cols);
  const spacer = (key: string, n: number) => n > 0 && <div key={key} class="shelf-spacer" style={{ height: `${n * r.pitch - r.gap}px` }} />;

  return (
    <div class="shelf" ref={ref} {...drag}>
      {spacer("above", r.start)}
      {list.slice(r.start * r.cols, r.end * r.cols).map(e => (
        <Card key={e.game.appid} e={e} editing={editing === e.game.appid} selected={selected.has(e.game.appid)}
          draggable={!!reorder} drop={drop?.appid === e.game.appid ? drop.side : null} />
      ))}
      {spacer("below", total - r.end)}
    </div>
  );
}
