/* Keyboard movement across shelves of cards (SPEC §6): one grid per band, all with the same columns. */

export type Direction = "left" | "right" | "up" | "down";

/**
 * The game focus moves to. Left and right follow reading order across shelves; up and down keep the
 * column, crossing into the previous or next shelf from its first or last row. Stays put at the edges.
 */
export function move(shelves: number[][], cols: number, id: number, dir: Direction): number {
  const s = shelves.findIndex(list => list.includes(id));
  if (s < 0) return id;
  const list = shelves[s];
  const i = list.indexOf(id);
  const col = i % cols;
  const prev = shelves.slice(0, s).reverse().find(l => l.length);
  const next = shelves.slice(s + 1).find(l => l.length);

  switch (dir) {
    case "left": return i > 0 ? list[i - 1] : prev?.at(-1) ?? id;
    case "right": return i < list.length - 1 ? list[i + 1] : next?.[0] ?? id;
    case "up": {
      if (i >= cols) return list[i - cols];
      if (!prev) return id;
      const lastRow = Math.floor((prev.length - 1) / cols) * cols;
      return prev[Math.min(lastRow + col, prev.length - 1)];
    }
    case "down": {
      if (i + cols < list.length) return list[i + cols];
      // A partial last row below: go to its last card
      if (Math.floor(i / cols) < Math.floor((list.length - 1) / cols)) return list[list.length - 1];
      return next ? next[Math.min(col, next.length - 1)] : id;
    }
  }
}
