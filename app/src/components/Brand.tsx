import { navigate } from "../route.ts";

/** The app's name, linking home. */
export function Brand() {
  return <a href="/" class="brand" onClick={e => { e.preventDefault(); navigate("/"); }}>Baquelogue</a>;
}
