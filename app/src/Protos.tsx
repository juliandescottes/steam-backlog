// Dev only: visual theme prototypes (protos.css), picked here or with ?proto=<name>; remembered in this browser.
import { useEffect, useState } from "preact/hooks";
import "./protos.css";

const FONTS: Record<string, string> = {
  bakelite: "Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,500..900,0..100,0..1;1,9..144,500..900,0..100,0..1&family=Instrument+Sans:wght@400..700&family=DM+Mono:wght@400;500",
  catalogue: "Courier+Prime:ital,wght@0,400;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700",
  arcade: "Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400..700&family=Space+Mono:wght@400;700",
  "arcade-pink": "Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400..700&family=Space+Mono:wght@400;700",
  "arcade-malabar": "Fredoka:wght@400..700&family=Nunito:wght@400..900&family=Space+Mono:wght@400;700",
  rental: "Anton&family=Archivo:wght@400..800&family=Archivo+Narrow:wght@500;700",
  terminal: "VT323&family=IBM+Plex+Mono:wght@400;600",
  editorial: "Inter+Tight:wght@400..800",
  handheld: "Press+Start+2P&family=Silkscreen",
};
const NAMES: Record<string, string> = {
  "": "Current", bakelite: "Bakelite", catalogue: "Catalogue", arcade: "Arcade", "arcade-pink": "Arcade Pink", "arcade-malabar": "Malabar",
  rental: "Rental (dark only)", terminal: "Terminal (dark only)", editorial: "Editorial", handheld: "Handheld (light only)",
};

function initial(): string {
  const q = new URLSearchParams(location.search).get("proto");
  if (q != null) return q in NAMES ? q : "";
  try { return localStorage.getItem("proto") ?? ""; } catch { return ""; }
}

export function Protos() {
  const [proto, setProto] = useState(initial);
  useEffect(() => {
    const root = document.documentElement;
    if (proto) root.dataset.proto = proto; else delete root.dataset.proto;
    try { localStorage.setItem("proto", proto); } catch { /* private mode */ }
    if (proto && !document.getElementById(`font-${proto}`)) {
      const link = Object.assign(document.createElement("link"), { id: `font-${proto}`, rel: "stylesheet",
        href: `https://fonts.googleapis.com/css2?family=${FONTS[proto]}&display=swap` });
      document.head.append(link);
    }
  }, [proto]);
  return (
    <label class="proto-switch">
      Theme
      <select value={proto} onChange={e => setProto(e.currentTarget.value)}>
        {Object.entries(NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  );
}
