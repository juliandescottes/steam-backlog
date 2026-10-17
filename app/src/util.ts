export const steamUrl = (appid: number) => `https://store.steampowered.com/app/${appid}`;
export const hltbSearchUrl = (name: string) => `https://howlongtobeat.com/?q=${encodeURIComponent(name)}`;

const ART = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps";
export const portraitUrl = (appid: number) => `${ART}/${appid}/library_600x900.jpg`;
export const headerUrl = (appid: number) => `${ART}/${appid}/header.jpg`;

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const ALT = isMac ? "⌥" : "Alt+";

export const playtime = (min: number) => (min < 60 ? `${min} min` : `${Math.round((min / 60) * 10) / 10} h`);
export const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "–");
export const thousands = (n: number) => Math.round(n).toLocaleString("en");

export function readFile(file: File): Promise<string> {
  return file.text();
}

export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when a key event comes from a text field, where letter shortcuts must not fire. */
export function inTextField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
