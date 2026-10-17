import { render } from "preact";
import { importing, initAccount } from "./account.ts";
import { Detail } from "./components/Detail.tsx";
import { FillIn } from "./components/FillIn.tsx";
import { Import } from "./components/Import.tsx";
import { Library } from "./components/Library.tsx";
import { Palette } from "./components/Palette.tsx";
import { SelectionBar } from "./components/SelectionBar.tsx";
import { Settings } from "./components/Settings.tsx";
import { Shortcuts } from "./components/Shortcuts.tsx";
import { Toast } from "./components/Toast.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { installKeys } from "./keys.ts";
import { fillInQueue, games, load, loaded, openId, paletteOpen, settingsOpen, shortcutsOpen } from "./store.ts";
import "./styles.css";

function App() {
  if (!loaded.value) return null;
  return (
    <>
      {importing.value ? <Import /> : games.value.size ? <Library /> : <Welcome />}
      {openId.value != null && <Detail />}
      {settingsOpen.value && <Settings />}
      {fillInQueue.value && <FillIn />}
      {shortcutsOpen.value && <Shortcuts />}
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
