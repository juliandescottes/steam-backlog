import { signal } from "@preact/signals";

/**
 * The page shown: the library, or a list at /s/<shareId>, which is the owner's list page when the list is in
 * this browser and the read-only shared page otherwise. /l/<id> is the old address of a list page (TECH.md §4).
 */
export type Route = { page: "library" } | { page: "list"; id: string } | { page: "shared"; shareId: string };

function parse(path: string): Route {
  const m = path.match(/^\/l\/([^/]+)\/?$/);
  if (m) return { page: "list", id: decodeURIComponent(m[1]) };
  const s = path.match(/^\/s\/([^/]+)\/?$/);
  if (s) return { page: "shared", shareId: decodeURIComponent(s[1]) };
  return { page: "library" };
}

export const route = signal<Route>(parse(location.pathname));

export function navigate(path: string, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.value = parse(path);
  window.scrollTo(0, 0);
}

export const listPath = (l: { shareId: string }) => `/s/${l.shareId}`;

window.addEventListener("popstate", () => (route.value = parse(location.pathname)));
