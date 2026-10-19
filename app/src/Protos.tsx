// Dev only: visual prototypes (protos.css) over the original look, picked here or with ?proto=<name>; remembered in this browser.
import { useEffect, useState } from "preact/hooks";
import "./protos.css";

/** The original design's fonts, which the prototypes build on. */
const ORIGINAL = "Big+Shoulders+Display:wght@600;800&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@500;700";
const FONTS: Record<string, string> = {
  original: ORIGINAL,
  terminal: `${ORIGINAL}&family=VT323&family=IBM+Plex+Mono:wght@400;600`,
  handheld: `${ORIGINAL}&family=Press+Start+2P&family=Silkscreen`,
};
const NAMES: Record<string, string> = { "": "Malabar (current)", original: "Original", terminal: "Terminal (dark only)", handheld: "Handheld (light only)" };

function initial(): string {
  const q = new URLSearchParams(location.search).get("proto");
  if (q != null) return q in NAMES ? q : "";
  try { const v = localStorage.getItem("proto") ?? ""; return v in NAMES ? v : ""; } catch { return ""; }
}

export function Protos() {
  const [proto, setProto] = useState(initial);
  useEffect(() => {
    const root = document.documentElement;
    if (proto) { root.dataset.proto = proto; delete root.dataset.design; } else { delete root.dataset.proto; root.dataset.design = "malabar"; }
    try { localStorage.setItem("proto", proto); } catch { /* private mode */ }
    if (proto && !document.getElementById(`font-${proto}`)) {
      const link = Object.assign(document.createElement("link"), { id: `font-${proto}`, rel: "stylesheet",
        href: `https://fonts.googleapis.com/css2?family=${FONTS[proto]}&display=swap` });
      document.head.append(link);
    }
  }, [proto]);
  return (
    <label class="proto-switch">
      Look
      <select value={proto} onChange={e => setProto(e.currentTarget.value)}>
        {Object.entries(NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
