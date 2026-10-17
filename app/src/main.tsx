import { render } from "preact";
import { lazy, Suspense } from "preact/compat";
import { importing, initAccount } from "./account.ts";
import { Detail } from "./components/Detail.tsx";
import { FillIn } from "./components/FillIn.tsx";
import { Import } from "./components/Import.tsx";
import { Library } from "./components/Library.tsx";
import { ListPicker, ListsDrawer } from "./components/Lists.tsx";
import { Palette } from "./components/Palette.tsx";
import { SelectionBar } from "./components/SelectionBar.tsx";
import { Settings } from "./components/Settings.tsx";
import { Shortcuts } from "./components/Shortcuts.tsx";
import { Toast } from "./components/Toast.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { installKeys } from "./keys.ts";
import { route } from "./route.ts";
import { fillInQueue, games, listsOpen, load, loaded, openId, paletteOpen, pickerFor, settingsOpen, shortcutsOpen } from "./store.ts";
import "./styles.css";

// Viewers of a shared list download this part only when they open one
const SharedPage = lazy(() => import("./components/Shared.tsx").then(m => ({ default: m.SharedPage })));

function App() {
  if (!loaded.value) return null;
  const r = route.value;
  if (r.page === "shared") {
    return (
      <>
        <Suspense fallback={null}><SharedPage key={r.shareId} shareId={r.shareId} /></Suspense>
        <div class="dock"><Toast /></div>
      </>
    );
  }
  return (
    <>
      {importing.value ? <Import /> : games.value.size ? <Library /> : <Welcome />}
      {openId.value != null && <Detail />}
      {settingsOpen.value && <Settings />}
      {fillInQueue.value && <FillIn />}
      {shortcutsOpen.value && <Shortcuts />}
      {listsOpen.value && <ListsDrawer />}
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
