import {
  expectedRuns,
  focusTeamFor,
  nameOf,
  oversText,
  scorecardAt,
  stateAt,
  summarizeWindow,
  type Timeline,
} from "./engine";
import type { MatchState, Prefs, WindowSummary } from "./types";

const pct = (n: number) => `${n}%`;
const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

function stateLine(tl: Timeline, s: MatchState): string {
  if (s.k < 0) return `Match about to start. ${s.batting} to bat first.`;
  let line = `${s.batting} ${s.score}/${s.wkts} (${s.oversText} ov)`;
  if (s.target !== null && s.need !== null) {
    line += s.need > 0 ? `, need ${s.need} off ${s.ballsLeft} balls (target ${s.target})` : `, target ${s.target} reached`;
  } else if (!s.inningsOver) {
    const projected = Math.round(s.score + expectedRuns(s.ballsLeft, s.wkts));
    line += `, run rate ${s.crr.toFixed(2)}, projected ≈${projected}`;
  }
  if (s.inningsOver && s.inn === 0) line += ` — innings complete, ${tl.meta.data.innings[1].team} need ${s.score + 1} to win`;
  return line;
}

export function buildFacts(tl: Timeline, from: number, to: number, prefs: Prefs): { facts: string; w: WindowSummary; now: MatchState } {
  const { meta } = tl;
  const d = meta.data;
  const focus = focusTeamFor(tl, prefs.team, to);
  const w = summarizeWindow(tl, from, to, focus);
  const then = stateAt(tl, from);
  const now = stateAt(tl, to);
  const L: string[] = [];

  L.push(`MATCH: ${meta.stakes} ${d.teams.join(" vs ")}, ${d.overs}-over match at ${d.venue}${d.city && !d.venue.includes(d.city) ? `, ${d.city}` : ""}. Toss: ${d.toss.winner} chose to ${d.toss.decision}.`);
  const fan = prefs.team === "neutral" ? "neutral fan" : `supports ${prefs.team}`;
  const follows = prefs.players.length ? `; follows ${prefs.players.map((p) => nameOf(tl, p, true)).join(", ")}` : "";
  L.push(`THE FAN: ${fan}${follows}.`);
  L.push("");
  L.push(`WHEN THE FAN LEFT: ${stateLine(tl, then)}. ${focus} win chance ${pct(w.chanceFrom)}.`);

  const crease = now.atCrease
    .map((b) => `${nameOf(tl, b.id)} ${b.runs}${now.inningsOver ? "" : "*"} (${b.balls})${b.onStrike && !now.inningsOver ? " on strike" : ""}`)
    .join(", ");
  const bowler = now.bowler ? `${nameOf(tl, now.bowler.id)} ${overs(now.bowler.balls)}-${now.bowler.runs}-${now.bowler.wkts}` : "—";
  L.push(`RIGHT NOW (the latest ball; nothing after this has happened yet): ${stateLine(tl, now)}.`);
  if (now.matchOver) L.push(`MATCH FINISHED: ${now.result}.`);
  else {
    L.push(`  Phase: ${now.phase}. At the crease: ${crease || "new batters"}. Last bowler: ${bowler}. Current partnership: ${now.partnership.runs} (${now.partnership.balls} balls).`);
    if (now.thisOver.length) L.push(`  ${now.legalBalls % 6 === 0 ? "Last over" : "This over so far"}: ${now.thisOver.join(" ")}`);
  }
  L.push(`  Win chance (simple model): ${Object.entries(now.winChance).map(([t, c]) => `${t} ${pct(c)}`).join(", ")}.`);
  if (now.firstInnings) L.push(`  First innings: ${now.firstInnings.team} ${now.firstInnings.score}/${now.firstInnings.wkts} (${now.firstInnings.oversText}).`);
  L.push("");

  L.push(`MISSED IN NUMBERS: ${w.balls} balls, ${w.runs} runs, ${w.wkts} wickets, ${w.fours} fours, ${w.sixes} sixes, ${w.extras} extras. ${focus} win chance ${pct(w.chanceFrom)} → ${pct(w.chanceTo)}.${w.crossedInnings ? " The innings break happened while the fan was away." : ""}`);
  L.push("OVER BY OVER (missed; • = dot, wd = wide, nb = no-ball, lb = leg-bye, W = wicket):");
  for (const o of w.overs) {
    L.push(`  ${d.innings[o.inn].team} ov ${o.overNo}${o.partial ? " (part)" : ""}, ${nameOf(tl, o.bowler)} bowling: ${o.seq.join(" ")} = ${o.runs}${o.wkts ? `, ${o.wkts}W` : ""} | ${focus} ${o.chanceBefore}→${o.chanceAfter}%`);
  }
  L.push("KEY MOMENTS (missed):");
  if (!w.moments.length) L.push("  none — steady cricket");
  for (const m of w.moments) L.push(`  ${m.label}: ${m.text}`);
  if (w.turning) L.push(`BIGGEST SWING: ${w.turning.text}`);

  L.push("BATTING WHILE AWAY:");
  for (const t of w.batting) {
    L.push(`  ${t.team}: ` + t.lines.map((b) => `${nameOf(tl, b.id)} ${b.runs} (${b.balls}b${b.fours ? `, ${b.fours}x4` : ""}${b.sixes ? `, ${b.sixes}x6` : ""})${b.out ? ` OUT ${b.out}` : ""}`).join("; "));
  }
  L.push("BOWLING WHILE AWAY:");
  for (const t of w.bowling) {
    L.push(`  ${t.team}: ` + t.lines.map((b) => `${nameOf(tl, b.id)} ${overs(b.balls)}-${b.runs}-${b.wkts}`).join("; "));
  }

  const cards = scorecardAt(tl, to);
  if (prefs.players.length) {
    L.push("FAN'S PLAYERS (whole match so far):");
    for (const p of prefs.players) {
      const parts: string[] = [];
      for (const c of cards) {
        const bat = c.batting.find((b) => b.id === p);
        if (bat) parts.push(`batting ${bat.runs} (${bat.balls})${bat.out ? ` out ${bat.out}` : c.complete ? " not out" : "*"}`);
        const bowl = c.bowling.find((b) => b.id === p);
        if (bowl) parts.push(`bowling ${overs(bowl.balls)}-${bowl.runs}-${bowl.wkts}`);
      }
      L.push(`  ${nameOf(tl, p, true)}: ${parts.join("; ") || "yet to bat or bowl"}`);
    }
  }

  if (!now.matchOver) {
    const cur = cards[cards.length - 1];
    const maxOvers = d.overs / 5;
    const left = cur.bowling
      .map((b) => ({ n: nameOf(tl, b.id), left: maxOvers - Math.ceil(b.balls / 6) }))
      .filter((b) => b.left > 0)
      .map((b) => `${b.n} ${b.left}`);
    L.push(`WHAT'S AHEAD: ${overs(now.ballsLeft)} overs left in this innings. Overs left for bowlers used so far: ${left.join(", ") || "n/a"} (max ${maxOvers} each).`);
  }

  L.push("");
  L.push("SCORECARD SO FAR:");
  for (const c of cards) {
    L.push(`  ${c.team} ${c.score}/${c.wkts} (${oversText(c.legalBalls)})${c.complete ? "" : " — in progress"}`);
    L.push("    " + c.batting.map((b) => `${nameOf(tl, b.id)} ${b.runs}(${b.balls})${b.out ? ` ${b.out}` : ""}`).join(", "));
    L.push("    Bowling: " + c.bowling.map((b) => `${nameOf(tl, b.id)} ${overs(b.balls)}-${b.runs}-${b.wkts}`).join(", "));
  }
  L.push(`PLAYERS: ${d.teams.map((t) => `${t}: ${d.squads[t].map((id) => nameOf(tl, id, true)).join(", ")}`).join(" | ")}`);

  return { facts: L.join("\n"), w, now };
}
