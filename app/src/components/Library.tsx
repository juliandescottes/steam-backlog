import { UNKNOWN_BAND, type Band } from "@backlog/shared/bands";
import { SORT_LABEL, type Entry, type SortKey } from "@backlog/shared/filter";
import { STATUSES, STATUS_LABEL, type Status } from "@backlog/shared/types";
import type { Signal } from "@preact/signals";
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { profilePath } from "@backlog/shared/share";
import { account } from "../account.ts";
import { route } from "../route.ts";
import {
  canReorder, currentList, editingId, listItems, listSort, listStatuses, moveInList, nowPlaying, played, query,
  selection, settings, settingsOpen, shelves, sortKey, sorting, startFillIn, statuses, totals, visible, type ListSort,
} from "../store.ts";
import { count, thousands } from "../util.ts";
import { Card } from "./Card.tsx";
import { CopyLink, ListHeader, MissingList, TopNav } from "./Lists.tsx";
import { Shelf } from "./Shelf.tsx";
import { TriageOffer } from "./Triage.tsx";
import { ConditionPills, ViewTabs } from "./Views.tsx";

/** Signed in: whether the profile is public and, when it is, its address to copy (LIST-16). */
function ProfileShare() {
  const me = account.value;
  if (!me) return null;
  if (!me.profilePublic || !me.profileId) {
    return (
      <p class="profile-share">
        Your profile is private. <button type="button" class="link" onClick={() => (settingsOpen.value = true)}>Share it</button>
      </p>
    );
  }
  const url = `${location.origin}${profilePath(me.profileId)}`;
  return (
    <p class="profile-share">
      Your profile is public at <a href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, "")}</a>
      <CopyLink url={url} icon />
    </p>
  );
}

/** Shrinks a heading from its CSS size so it stays on one line, down to `min` px; narrower than that, it wraps at `min`. */
function useOneLine(el: RefObject<HTMLElement | null>, text: string, min = 40) {
  useLayoutEffect(() => {
    const h = el.current;
    if (!h) return;
    const fit = () => {
      const box = h.parentElement!, pad = getComputedStyle(box);
      const room = box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
      Object.assign(h.style, { fontSize: "", whiteSpace: "nowrap", width: "max-content" });
      const ratio = room / h.getBoundingClientRect().width;
      h.style.width = "";
      if (ratio >= 1) return;
      const size = Math.floor(parseFloat(getComputedStyle(h).fontSize) * ratio * 0.99);
      if (size < min) h.style.whiteSpace = "";
      h.style.fontSize = `${Math.max(size, min)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h.parentElement!);
    void document.fonts.ready.then(fit);
    return () => ro.disconnect();
  }, [text]);
}

function Header() {
  const t = totals.value;
  const done = t.finishedHours + t.leftHours > 0 ? t.finishedHours / (t.finishedHours + t.leftHours) : 0;
  const title = useRef<HTMLHeadingElement>(null);
  useOneLine(title, `${t.left} ${t.leftHours}`);
  return (
    <header class="top">
      <TopNav />
      <h1 ref={title}>{count(t.left, "game")}, <em>{count(t.leftHours, "hour")}</em> to clear</h1>
      <p class="lede">
        <span class="cleared" title={`${thousands(t.finishedHours)}h finished`}>{t.finished} finished · {Math.round(done * 100)}% of hours cleared</span>
      </p>
      <ProfileShare />
    </header>
  );
}

/** Games in progress, in a row that scrolls sideways; when turned on in Settings, hidden when there are none (LIB-2). */
function NowPlaying() {
  const list = nowPlaying.value;
  if (!list.length) return null;
  const editing = editingId.value;
  const selected = selection.value;
  return (
    <section class="now-playing" aria-labelledby="now-playing-title">
      <div class="band-head">
        <h2 id="now-playing-title">Now playing</h2>
        <p>{count(list.length, "game")}</p>
      </div>
      <div class="now-row">
        {list.map(e => <Card key={e.game.appid} e={e} editing={editing === e.game.appid} selected={selected.has(e.game.appid)} />)}
      </div>
    </section>
  );
}

function BandIndex({ groups }: { groups: { band: Band; entries: Entry[] }[] }) {
  return (
    <nav class="index" aria-label="Length bands">
      <div class="bar">
        {groups.map(({ band, entries }) => (
          <a key={band.id} href={`#${band.id}`} style={{ flex: entries.length, background: `var(${band.color})` }}
            title={`${band.label}: ${entries.length}`} aria-label={`${band.label}, ${count(entries.length, "game")}`} />
        ))}
      </div>
      <div class="legend">
        {groups.map(({ band, entries }) => (
          <a key={band.id} href={`#${band.id}`} style={{ "--c": `var(${band.color})` }}><i />{band.label.replace(" h", "h")} <span>{entries.length}</span></a>
        ))}
      </div>
    </nav>
  );
}

/** Search, statuses and sort; on a list page they apply to the list, with its own order as a sort. */
function Toolbar() {
  const onList = currentList.value;
  const st: Signal<Status[]> = onList ? listStatuses : statuses;
  const toggle = (s: Status) => {
    const cur = st.value;
    st.value = cur.includes(s) ? cur.filter(x => x !== s) : STATUSES.filter(x => x === s || cur.includes(x));
  };
  const sort = onList ? listSort : (sortKey as Signal<ListSort>);
  return (
    <div class="tools">
      <input type="search" id="search" placeholder="Search  ( / )" aria-label="Search games by name"
        value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
      <div class="chips" role="group" aria-label="Statuses shown">
        {STATUSES.map(s => (
          <button type="button" key={s} class="chip" aria-pressed={st.value.includes(s)} onClick={() => toggle(s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
      {!onList && (
        <select aria-label="Played" value={played.value} onChange={e => (played.value = e.currentTarget.value as typeof played.value)}>
          <option value="any">Played or not</option>
          <option value="played">Played</option>
          <option value="never">Never launched</option>
        </select>
      )}
      <select aria-label="Sort" value={sort.value} onChange={e => (sort.value = e.currentTarget.value as SortKey)}>
        {onList?.kind === "manual" && <option value="list">Sort: List order</option>}
        {Object.entries(SORT_LABEL).map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
      </select>
      {!onList && <ConditionPills />}
    </div>
  );
}

export function Library() {
  const openList = currentList.value;
  if (!openList && route.value.page === "oldList") return <MissingList />;
  const list = visible.value;
  const groups = shelves.value;
  const byLength = sorting.value === "length";
  const bands = groups.filter((g): g is { band: Band; entries: Entry[] } => g.band != null);
  const reorder = canReorder.value && openList
    ? (appid: number, target: number, side: "before" | "after") => moveInList(openList.id, appid, target, side) : undefined;

  return (
    <div class="wrap">
      {openList ? <ListHeader key={openList.id} list={openList} /> : <>
        <Header />
        <TriageOffer />
        {settings.value.nowPlaying && <NowPlaying />}
        <ViewTabs />
      </>}
      {byLength && bands.length > 0 && <BandIndex groups={bands} />}
      <Toolbar />
      <main class={`bands${selection.value.size ? " selecting" : ""}`}>
        {list.length === 0 && (openList?.kind === "manual" && !listItems.value.get(openList.id)?.size
          ? <p class="empty">No games in this list yet. Add some from your backlog with the + on a cover, or select several and use “Add to list”.</p>
          : <p class="empty">No games match. Try other statuses or clear the search.</p>)}
        {byLength ? bands.map(({ band, entries }) => {
          const hours = entries.reduce((s, e) => s + (e.len.hours ?? 0), 0);
          return (
            <section key={band.id} class="band" id={band.id} style={{ "--c": `var(${band.color})` }}>
              <div class="band-head">
                <h2>{band.label}</h2>
                <p>{count(entries.length, "game")}{band.max != null && ` · ${thousands(hours)}h together`}</p>
                {band === UNKNOWN_BAND && (
                  <button type="button" class="btn primary" onClick={() => startFillIn(entries.map(e => e.game.appid))}>Fill in lengths</button>
                )}
              </div>
              <Shelf list={entries} reorder={reorder} />
            </section>
          );
        }) : groups.map(g => <Shelf key="all" list={g.entries} reorder={reorder} />)}
      </main>
      <footer>Lengths from IGDB and from you. Box art from Steam. Your data stays in this browser; back it up from Settings.</footer>
    </div>
  );
}
