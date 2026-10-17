import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bandOf, formatHours } from "@backlog/shared/bands";
import { compare, matches, SORT_LABEL, type Entry, type SortKey } from "@backlog/shared/filter";
import { resolveLength } from "@backlog/shared/lengths";
import { normalizeName } from "@backlog/shared/names";
import type { SharedList } from "@backlog/shared/share";
import { STATUSES, STATUS_LABEL, type Status } from "@backlog/shared/types";
import { navigate } from "../route.ts";
import { settings } from "../store.ts";
import { count, steamUrl } from "../util.ts";
import { Art } from "./Art.tsx";

const POLL_MS = 30_000;
type State = { kind: "loading" } | { kind: "missing" } | { kind: "offline" } | { kind: "ok"; data: SharedList };

/** Fetches a shared list, then again every 30 s while the page is visible and when it comes back into view; unchanged lists cost a 304. */
function useSharedList(shareId: string): State {
  const [state, setState] = useState<State>({ kind: "loading" });
  const etag = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/s/${encodeURIComponent(shareId)}`,
          { headers: etag.current ? { "if-none-match": etag.current } : {}, cache: "no-cache" });
        if (stopped || res.status === 304) return;
        if (res.status === 404) { etag.current = null; return setState({ kind: "missing" }); }
        if (!res.ok) throw new Error(String(res.status));
        etag.current = res.headers.get("etag");
        setState({ kind: "ok", data: await res.json() });
      } catch {
        if (!stopped) setState(s => (s.kind === "ok" ? s : { kind: "offline" }));
      }
    };
    void load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("focus", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("focus", load);
    };
  }, [shareId]);
  return state;
}

/** Someone's shared list, read-only (SPEC §7). Viewers can filter and sort within it. */
export function SharedPage({ shareId }: { shareId: string }) {
  const state = useSharedList(shareId);
  const data = state.kind === "ok" ? state.data : null;
  const [statuses, setStatuses] = useState<Status[]>(STATUSES);
  const [sort, setSort] = useState<SortKey | "list" | null>(null);
  const [q, setQ] = useState("");
  const measure = settings.value.measure;

  const all = useMemo(() => (data?.games ?? []).map((game): Entry => ({ game, len: resolveLength(game, measure), key: normalizeName(game.name) })), [data, measure]);
  const order = sort ?? (data?.list.kind === "manual" ? "list" : data?.list.sort ?? "length");
  const shown = all.filter(e => matches(e, { statuses, q }));
  if (order !== "list") shown.sort(compare(order));

  useEffect(() => {
    document.title = data ? `${data.list.title} · ${data.owner.name}` : "Backlog";
    return () => { document.title = "Backlog"; };
  }, [data?.list.title, data?.owner.name]);

  if (state.kind !== "ok") {
    return (
      <div class="wrap shared">
        <header class="top">
          {state.kind === "loading" ? <p class="lede">Loading…</p> : <>
            <h1>{state.kind === "missing" ? "List not found" : "Can't load this list"}</h1>
            <p class="lede">{state.kind === "missing" ? "It may be private now, or the link changed." : "Check your connection; it will retry by itself."}</p>
          </>}
        </header>
        <Footer />
      </div>
    );
  }

  const { owner, list } = data!;
  const hours = all.reduce((s, e) => s + (e.len.hours ?? 0), 0);
  const finished = all.filter(e => e.game.status === "finished").length;
  const toggle = (s: Status) => setStatuses(cur => (cur.includes(s) ? cur.filter(x => x !== s) : STATUSES.filter(x => x === s || cur.includes(x))));

  return (
    <div class="wrap shared">
      <header class="top">
        <div class="eyebrow-row">
          <div class="eyebrow owner">
            {owner.avatar && <img src={owner.avatar} alt="" width={20} height={20} />}
            {owner.name}'s list
          </div>
        </div>
        <h1>{list.title}</h1>
        {list.description && <p class="lede">{list.description}</p>}
        <p class="list-meta">
          {count(all.length, "game")} · {count(hours, "hour")}{finished > 0 && ` · ${finished} finished`}
          {list.kind === "filter" && <span> · updates with {owner.name}'s library</span>}
        </p>
      </header>
      <div class="tools">
        <input type="search" placeholder="Search" aria-label="Search games by name" value={q} onInput={e => setQ(e.currentTarget.value)} />
        <div class="chips" role="group" aria-label="Statuses shown">
          {STATUSES.map(s => (
            <button type="button" key={s} class="chip" aria-pressed={statuses.includes(s)} onClick={() => toggle(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        <select aria-label="Sort" value={order} onChange={e => setSort(e.currentTarget.value as SortKey | "list")}>
          {list.kind === "manual" && <option value="list">Sort: List order</option>}
          {Object.entries(SORT_LABEL).filter(([k]) => k !== "added" && k !== "playtime" && k !== "changed")
            .map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
        </select>
      </div>
      <main class="bands">
        {shown.length === 0
          ? <p class="empty">{all.length ? "No games match." : "This list is empty for now."}</p>
          : <div class="shelf">{shown.map(e => <ViewerCard key={e.game.appid} e={e} />)}</div>}
      </main>
      <Footer />
    </div>
  );
}

/** A cover without actions: opens the game on Steam. */
function ViewerCard({ e }: { e: Entry }) {
  const { game: g, len } = e;
  return (
    <article class={`game status-${g.status}`} style={{ "--c": `var(${bandOf(len).color})` }}>
      <div class="cover-wrap">
        <a class={`cover${g.portrait === false ? " wide" : ""}`} href={steamUrl(g.appid)} target="_blank" rel="noopener" aria-label={`${g.name} on Steam`}>
          <Art game={g} />
        </a>
        {len.hours == null && !len.endless
          ? <span class="hrs unknown" title="No length yet">?</span>
          : <span class={`hrs${len.approx ? " approx" : ""}`}>{len.endless ? "∞" : formatHours(len.hours)}</span>}
        {g.status !== "backlog" && <span class="status-chip">{STATUS_LABEL[g.status]}</span>}
      </div>
      <div class="meta"><div class="name">{g.name}</div></div>
    </article>
  );
}

function Footer() {
  return (
    <footer>
      Lengths from IGDB and players. Box art from Steam.{" "}
      <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }}>Track your own Steam backlog →</a>
    </footer>
  );
}
