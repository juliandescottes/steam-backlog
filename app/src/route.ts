import { signal } from "@preact/signals";

/** The page shown: the library, or one of the user's lists at /l/<id> (TECH.md §4). */
export type Route = { page: "library" } | { page: "list"; id: string };

function parse(path: string): Route {
  const m = path.match(/^\/l\/([^/]+)\/?$/);
  return m ? { page: "list", id: decodeURIComponent(m[1]) } : { page: "library" };
}

export const route = signal<Route>(parse(location.pathname));

export function navigate(path: string, replace = false) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.value = parse(path);
  window.scrollTo(0, 0);
}

export const listPath = (id: string) => `/l/${encodeURIComponent(id)}`;

window.addEventListener("popstate", () => (route.value = parse(location.pathname)));
