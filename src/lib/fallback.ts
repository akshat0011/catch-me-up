import { nameOf, type Timeline } from "../../shared/engine";
import type { Recap } from "../../shared/prompt";
import type { MatchState, WindowSummary } from "../../shared/types";

/** Data-only recap used when the AI is unavailable, so a fan never gets a blank screen. */
export function fallbackRecap(tl: Timeline, w: WindowSummary, now: MatchState): Recap {
  const delta = w.chanceTo - w.chanceFrom;
  const overs = `${Math.floor(w.balls / 6)}${w.balls % 6 ? `.${w.balls % 6}` : ""} overs`;
  const headline =
    Math.abs(delta) >= 10
      ? `${w.focusTeam} ${delta > 0 ? "surge" : "slip"}: win chance ${w.chanceFrom}% → ${w.chanceTo}%`
      : `${w.runs}/${w.wkts} in the ${overs} you missed`;
  const priority = { wicket: 0, bigover: 1, milestone: 2, break: 3, tightover: 4, six: 5, four: 6 };
  const recap = [...w.moments]
    .sort((a, b) => priority[a.kind] - priority[b.kind])
    .slice(0, 4)
    .sort((a, b) => a.i - b.i)
    .map((m) => `${m.label}: ${m.text}`);
  if (!recap.length) recap.push(`${w.runs} runs, ${w.wkts} wickets — steady cricket.`);
  const right = now.matchOver
    ? now.result ?? ""
    : now.need !== null
      ? `${now.batting} ${now.score}/${now.wkts} (${now.oversText}), need ${now.need} off ${now.ballsLeft}.`
      : `${now.batting} ${now.score}/${now.wkts} after ${now.oversText} overs.`;
  const next = now.matchOver
    ? []
    : now.atCrease.map((b) => `${nameOf(tl, b.id)} on ${b.runs} (${b.balls})`).slice(0, 2);
  return { headline, recap, turning: w.turning?.text ?? "", now: right, next };
}
