import { signal } from "@preact/signals";
import { SHARE_ID } from "@backlog/shared/lists";
import { sharePath } from "@backlog/shared/share";

/**
 * The page shown: the library, the user's lists at /lists, or a list at /l/<shareId>: the owner's list page when the list is in this browser,
 * the read-only shared page otherwise; or a public profile at /u/<profile id>, with the whole backlog at /u/<profile id>/backlog. /l/<internal id> and /s/<shareId> are
 * older addresses (TECH.md §4).
 */
export type Route = { page: "library" } | { page: "lists" } | { page: "list"; shareId: string } | { page: "oldList"; id: string } | { page: "profile"; id: string }
  | { page: "backlog"; id: string };

function parse(path: string): Route {
  if (/^\/lists\/?$/.test(path)) return { page: "lists" };
  const u = path.match(/^\/u\/([^/]+)(\/backlog)?\/?$/);
  if (u) return { page: u[2] ? "backlog" : "profile", id: decodeURIComponent(u[1]) };
  const m = path.match(/^\/[ls]\/([^/]+)\/?$/);
  if (!m) return { page: "library" };
  const id = decodeURIComponent(m[1]);
  return SHARE_ID.test(id) ? { page: "list", shareId: id } : { page: "oldList", id };
}

// Links from before lists moved to /l/
if (/^\/s\//.test(location.pathname)) history.replaceState(null, "", location.pathname.replace(/^\/s\//, "/l/"));

export const LISTS_PATH = "/lists";

export const route = signal<Route>(parse(location.pathname));

export function navigate(path: string, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.value = parse(path);
  window.scrollTo(0, 0);
}

export const listPath = (l: { shareId: string }) => sharePath(l.shareId);

window.addEventListener("popstate", () => (route.value = parse(location.pathname)));
