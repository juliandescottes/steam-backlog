import { UNKNOWN_BAND, type Band } from "@backlog/shared/bands";
import { SORT_LABEL, type Entry, type SortKey } from "@backlog/shared/filter";
import { STATUSES, STATUS_LABEL, type Status } from "@backlog/shared/types";
import type { Signal } from "@preact/signals";
import { route } from "../route.ts";
import {
  canReorder, currentList, dismissTriage, editingId, finishPlayed, listItems, listSort, listStatuses, listsOpen, moveInList, nowPlaying, played, query,
  selection, settings, settingsOpen, shelves, sortKey, sorting, startFillIn, statuses, totals, triageCandidates, triaged, visible, type ListSort,
} from "../store.ts";
import { count, thousands } from "../util.ts";
import { Card } from "./Card.tsx";
import { ListHeader, MissingList } from "./Lists.tsx";
import { Shelf } from "./Shelf.tsx";
import { ConditionPills, ViewTabs } from "./Views.tsx";

const MEASURE_TEXT = {
  main_extra: <>by <b>Main + Extras</b> time: the main story plus the side content most players do</>,
  main: <>by <b>Main story</b> time</>,
};

function Header() {
  const t = totals.value;
  const done = t.finishedHours + t.leftHours > 0 ? t.finishedHours / (t.finishedHours + t.leftHours) : 0;
  return (
    <header class="top">
      <div class="eyebrow-row">
        <div class="eyebrow">Backlog</div>
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={() => (listsOpen.value = true)}>Lists</button>
          <button type="button" class="btn ghost" onClick={() => (settingsOpen.value = true)}>Settings</button>
        </div>
      </div>
      <h1>{count(t.left, "game")}, <em>{count(t.leftHours, "hour")}</em> to clear</h1>
      <p class="lede">
        Shortest first, {MEASURE_TEXT[settings.value.measure]}.
        {t.unknown > 0 && <> Plus <button type="button" class="link" onClick={() => startFillIn()}>{t.unknown} without a length</button>.</>}
      </p>
      <div class="progress" title={`${t.finished} finished, ${thousands(t.finishedHours)}h`}>
        <div class="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}
          aria-label="Hours cleared"><i style={{ width: `${done * 100}%` }} /></div>
        <span>{t.finished} finished · {Math.round(done * 100)}% of hours cleared</span>
      </div>
    </header>
  );
}

function Triage() {
  const list = triageCandidates.value;
  if (triaged.value || !list.length) return null;
  const names = list.slice(0, 2).map(e => e.game.name);
  const more = list.length - names.length;
  return (
    <aside class="triage" aria-label="Finished games">
      <p>
        You've played <b>{count(list.length, "game")}</b> for at least 80% of {list.length === 1 ? "its" : "their"} length
        {" "}({names.join(", ")}{more > 0 && ` and ${more} more`}). Mark {list.length === 1 ? "it" : "them"} Finished?
      </p>
      <p class="row-actions">
        <button type="button" class="btn primary" onClick={() => finishPlayed(list.map(e => e.game.appid))}>Mark Finished</button>
        <button type="button" class="btn ghost" onClick={dismissTriage}>No thanks</button>
      </p>
    </aside>
  );
}

/** Games in progress, in a row that scrolls sideways; hidden when there are none (SPEC §3). */
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
          <a key={band.id} href={`#${band.id}`} style={{ "--c": `var(${band.color})` }}><i />{band.label} <span>{entries.length}</span></a>
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
  if (!openList && route.value.page === "list") return <MissingList />;
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
        <Triage />
        <NowPlaying />
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
