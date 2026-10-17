import { useState } from "preact/hooks";
import type { Game } from "@backlog/shared/types";
import { updateQuietly } from "../store.ts";
import { headerUrl, portraitUrl } from "../util.ts";

/** Portrait box art, falling back to the wide header art over a blurred copy of itself, then to the name. */
export function Art({ game, eager = false }: { game: Game; eager?: boolean }) {
  const [mode, setMode] = useState<"portrait" | "wide" | "none">(game.portrait === false ? "wide" : "portrait");
  const loading = eager ? "eager" : "lazy";

  if (mode === "portrait") {
    return (
      <img src={portraitUrl(game.appid)} alt="" loading={loading} decoding="async"
        onLoad={() => game.portrait !== true && updateQuietly(game.appid, { portrait: true })}
        onError={() => { setMode("wide"); updateQuietly(game.appid, { portrait: false }); }} />
    );
  }
  if (mode === "wide") {
    return (
      <span class="art-wide">
        <img class="bg" src={headerUrl(game.appid)} alt="" loading={loading} />
        <img class="fg" src={headerUrl(game.appid)} alt="" loading={loading} decoding="async" onError={() => setMode("none")} />
      </span>
    );
  }
  return <span class="art-none">{game.name}</span>;
}
