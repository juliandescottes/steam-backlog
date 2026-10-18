import { portraitUrl } from "../util.ts";

/** The first four covers of a list, side by side. */
export function MiniCovers({ covers }: { covers: number[] }) {
  return (
    <span class="mini-covers">
      {[0, 1, 2, 3].map(i => <span key={i}>{covers[i] != null && <img src={portraitUrl(covers[i])} alt="" loading="lazy" onError={e => e.currentTarget.remove()} />}</span>)}
    </span>
  );
}
