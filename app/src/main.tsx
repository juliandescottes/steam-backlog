import { options, render } from "preact";
import { lazy, Suspense } from "preact/compat";
import { importing, initAccount } from "./account.ts";
import { Detail } from "./components/Detail.tsx";
import { FillIn } from "./components/FillIn.tsx";
import { Import } from "./components/Import.tsx";
import { Library } from "./components/Library.tsx";
import { ListPicker, ListsPage } from "./components/Lists.tsx";
import { Palette } from "./components/Palette.tsx";
import { SelectionBar } from "./components/SelectionBar.tsx";
import { Settings } from "./components/Settings.tsx";
import { Shortcuts } from "./components/Shortcuts.tsx";
import { Toast } from "./components/Toast.tsx";
import { TriageReview } from "./components/Triage.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { installKeys } from "./keys.ts";
import { route } from "./route.ts";
import { fillInQueue, games, viewing, load, loaded, openId, paletteOpen, pickerFor, settingsOpen, shortcutsOpen, triageOpen } from "./store.ts";
import "./styles.css";
import "./malabar.css";

// Dev only: which cards rendered, for e2e/perf.spec.ts
if (import.meta.env.DEV) {
  const w = window as unknown as { cardRenders: number[] };
  w.cardRenders = [];
  const diffed = options.diffed;
  options.diffed = vnode => {
    const props = vnode.props as { e?: { game: { appid: number } } };
    if (typeof vnode.type === "function" && vnode.type.name === "Card" && props.e) w.cardRenders.push(props.e.game.appid);
    diffed?.(vnode);
  };
}

// Viewers of a shared list download this part only when they open one
const SharedPage = lazy(() => import("./components/Shared.tsx").then(m => ({ default: m.SharedPage })));
const ProfilePage = lazy(() => import("./components/Shared.tsx").then(m => ({ default: m.ProfilePage })));

function App() {
  if (!loaded.value) return null;
  const r = route.value;
  if (viewing.value) {
    return (
      <>
        <Suspense fallback={null}>
          {r.page === "profile" ? <ProfilePage key={r.id} id={r.id} />
            : r.page === "backlog" ? <SharedPage key={`${r.id}/backlog`} src={`/api/u/${encodeURIComponent(r.id)}/backlog`} whole />
            : r.page === "list" && <SharedPage key={r.shareId} src={`/api/s/${encodeURIComponent(r.shareId)}`} />}
        </Suspense>
        <div class="dock"><Toast /></div>
      </>
    );
  }
  return (
    <>
      {importing.value ? <Import /> : !games.value.size ? <Welcome /> : r.page === "lists" ? <ListsPage /> : <Library />}
      {openId.value != null && <Detail />}
      {settingsOpen.value && <Settings />}
      {fillInQueue.value && <FillIn />}
      {shortcutsOpen.value && <Shortcuts />}
      {triageOpen.value && <TriageReview />}
      {pickerFor.value && <ListPicker />}
      {paletteOpen.value && !importing.value && games.value.size > 0 && <Palette />}
      <div class="dock">
        <Toast />
        {!importing.value && <SelectionBar />}
      </div>
    </>
  );
}

installKeys();
void load().then(initAccount);
render(<App />, document.getElementById("app")!);
// Dev only: visual theme prototypes; hidden from e2e
if (import.meta.env.DEV && !import.meta.env.VITE_E2E) {
  void import("./Protos.tsx").then(m => render(<m.Protos />, document.body.appendChild(document.createElement("div"))));
}
