import { signal } from "@preact/signals";
import { SHARE_ID } from "@backlog/shared/lists";
import { sharePath } from "@backlog/shared/share";

/**
 * The page shown: the library, or a list at /l/<shareId>: the owner's list page when the list is in this browser,
 * the read-only shared page otherwise; or a public profile at /u/<handle>. /l/<internal id> and /s/<shareId> are
 * older addresses (TECH.md §4).
 */
export type Route = { page: "library" } | { page: "list"; shareId: string } | { page: "oldList"; id: string } | { page: "profile"; handle: string };

function parse(path: string): Route {
  const u = path.match(/^\/u\/([^/]+)\/?$/);
  if (u) return { page: "profile", handle: decodeURIComponent(u[1]) };
  const m = path.match(/^\/[ls]\/([^/]+)\/?$/);
  if (!m) return { page: "library" };
  const id = decodeURIComponent(m[1]);
  return SHARE_ID.test(id) ? { page: "list", shareId: id } : { page: "oldList", id };
}

// Links from before lists moved to /l/
if (/^\/s\//.test(location.pathname)) history.replaceState(null, "", location.pathname.replace(/^\/s\//, "/l/"));

export const route = signal<Route>(parse(location.pathname));

export function navigate(path: string, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.value = parse(path);
  window.scrollTo(0, 0);
}

export const listPath = (l: { shareId: string }) => sharePath(l.shareId);

window.addEventListener("popstate", () => (route.value = parse(location.pathname)));
