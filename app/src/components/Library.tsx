import { UNKNOWN_BAND, type Band } from "@backlog/shared/bands";
import { SORT_LABEL, type Entry, type SortKey } from "@backlog/shared/filter";
import { STATUSES, STATUS_LABEL, type Status } from "@backlog/shared/types";
import {
  dismissTriage, finishPlayed, played, query, settings, settingsOpen, shelves, sortKey, startFillIn, statuses, totals, triageCandidates, triaged, visible,
} from "../store.ts";
import { count, thousands } from "../util.ts";
import { Shelf } from "./Shelf.tsx";

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
        <button type="button" class="btn ghost" onClick={() => (settingsOpen.value = true)}>Settings</button>
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

function Toolbar() {
  const toggle = (s: Status) => {
    const cur = statuses.value;
    statuses.value = cur.includes(s) ? cur.filter(x => x !== s) : STATUSES.filter(x => x === s || cur.includes(x));
  };
  return (
    <div class="tools">
      <input type="search" id="search" placeholder="Search  ( / )" aria-label="Search games by name"
        value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
      <div class="chips" role="group" aria-label="Statuses shown">
        {STATUSES.map(s => (
          <button type="button" key={s} class="chip" aria-pressed={statuses.value.includes(s)} onClick={() => toggle(s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
      <select aria-label="Played" value={played.value} onChange={e => (played.value = e.currentTarget.value as typeof played.value)}>
        <option value="any">Played or not</option>
        <option value="played">Played</option>
        <option value="never">Never launched</option>
      </select>
      <select aria-label="Sort" value={sortKey.value} onChange={e => (sortKey.value = e.currentTarget.value as SortKey)}>
        {Object.entries(SORT_LABEL).map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
      </select>
    </div>
  );
}

export function Library() {
  const list = visible.value;
  const groups = shelves.value;
  const byLength = sortKey.value === "length";
  const bands = groups.filter((g): g is { band: Band; entries: Entry[] } => g.band != null);

  return (
    <div class="wrap">
      <Header />
      <Triage />
      {byLength && bands.length > 0 && <BandIndex groups={bands} />}
      <Toolbar />
      <main class="bands">
        {list.length === 0 && <p class="empty">No games match. Try other statuses or clear the search.</p>}
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
              <Shelf list={entries} />
            </section>
          );
        }) : groups.map(g => <Shelf key="all" list={g.entries} />)}
      </main>
      <footer>Lengths from IGDB and from you. Box art from Steam. Your data stays in this browser; back it up from Settings.</footer>
    </div>
  );
}
