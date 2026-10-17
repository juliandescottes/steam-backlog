import { render } from "preact";
import { Detail } from "./components/Detail.tsx";
import { FillIn } from "./components/FillIn.tsx";
import { Library } from "./components/Library.tsx";
import { Settings } from "./components/Settings.tsx";
import { Toast } from "./components/Toast.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { installKeys } from "./keys.ts";
import { fillInQueue, games, load, loaded, openId, settingsOpen } from "./store.ts";
import "./styles.css";

function App() {
  if (!loaded.value) return null;
  return (
    <>
      {games.value.size ? <Library /> : <Welcome />}
      {openId.value != null && <Detail />}
      {settingsOpen.value && <Settings />}
      {fillInQueue.value && <FillIn />}
      <Toast />
    </>
  );
}

installKeys();
void load();
render(<App />, document.getElementById("app")!);
