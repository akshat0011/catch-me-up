import type { MatchMeta } from "./matches.js";
import type {
  Ball,
  BatterLine,
  BowlerLine,
  KeyMoment,
  MatchState,
  OverSummary,
  WindowSummary,
} from "./types.js";

export interface Timeline {
  meta: MatchMeta;
  balls: Ball[];
  innStart: number[];
  innEnd: number[];
  maxBalls: number;
  pFirst: number[]; // P(team batting first wins) after each ball
  pStart: number;
}

const isLegal = (extraType: string) => extraType !== "wides" && extraType !== "noballs";
const NOT_BOWLERS_WICKET = new Set(["run out", "retired hurt", "retired out", "obstructing the field"]);

// ---------------------------------------------------------------------------
// Win chance: a DLS-style "resources" curve tuned to modern T20 scoring.
// expectedRuns(balls, wickets) = Z0·F(w)·(1 − e^(−b·overs/F(w)))
// Good enough to say who's ahead and by how much; not a betting model.
// ---------------------------------------------------------------------------
const Z0 = 358;
const B = 0.0335;
const F = [1, 0.92, 0.83, 0.72, 0.6, 0.48, 0.36, 0.25, 0.14, 0.06];

export function expectedRuns(ballsLeft: number, wktsLost: number): number {
  if (ballsLeft <= 0 || wktsLost >= 10) return 0;
  const f = F[wktsLost];
  return Z0 * f * (1 - Math.exp((-B * (ballsLeft / 6)) / f));
}

function phi(x: number): number {
  // Abramowitz–Stegun approximation of the standard normal CDF
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + Math.sign(x) * erf);
}

const sigma = (balls: number) => (balls > 0 ? 2 * Math.sqrt(balls) + 3 : 0);
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

function pChaseFirstInnings(score: number, wkts: number, ballsLeft: number, maxBalls: number): number {
  const projected = score + expectedRuns(ballsLeft, wkts);
  const chaseExpected = expectedRuns(maxBalls, 0);
  const sd = Math.hypot(sigma(ballsLeft), sigma(maxBalls));
  return clamp(phi((chaseExpected - (projected + 1) + 0.5) / sd));
}

function pChaseSecondInnings(need: number, wkts: number, ballsLeft: number): number {
  if (need <= 0) return 1;
  if (wkts >= 10 || ballsLeft <= 0) return 0;
  return clamp(phi((expectedRuns(ballsLeft, wkts) - need + 0.5) / sigma(ballsLeft)));
}

// ---------------------------------------------------------------------------

export function buildTimeline(meta: MatchMeta): Timeline {
  const balls: Ball[] = [];
  const innStart: number[] = [];
  const innEnd: number[] = [];
  meta.data.innings.forEach((inn, ii) => {
    innStart.push(balls.length);
    let score = 0;
    let wkts = 0;
    let legalBalls = 0;
    let curOver = -1;
    let legalInOver = 0;
    for (const d of inn.d) {
      const [over, batter, bowler, nonStriker, runsBat, extras, extraType] = d;
      const w = d[7];
      if (over !== curOver) {
        curOver = over;
        legalInOver = 0;
      }
      const legal = isLegal(extraType);
      const label = `${over}.${Math.min(legalInOver + 1, 6)}`;
      if (legal) {
        legalInOver++;
        legalBalls++;
      }
      score += runsBat + extras;
      if (w) wkts++;
      balls.push({
        i: balls.length,
        inn: ii,
        over,
        label,
        batter,
        bowler,
        nonStriker,
        runsBat,
        extras,
        extraType,
        total: runsBat + extras,
        legal,
        wicket: w ? { kind: w[0], out: w[1], fielders: w[2] } : undefined,
        score,
        wkts,
        legalBalls,
      });
    }
    innEnd.push(balls.length - 1);
  });

  const maxBalls = meta.data.overs * 6;
  const target = meta.data.innings[1]?.target?.runs ?? 0;
  const pFirst = balls.map((b) => {
    if (b.inn === 0) {
      const ballsLeft = b.i === innEnd[0] ? 0 : maxBalls - b.legalBalls;
      return 1 - pChaseFirstInnings(b.score, b.wkts, ballsLeft, maxBalls);
    }
    return 1 - pChaseSecondInnings(target - b.score, b.wkts, maxBalls - b.legalBalls);
  });
  const pStart = 1 - pChaseFirstInnings(0, 0, maxBalls, maxBalls);
  return { meta, balls, innStart, innEnd, maxBalls, pFirst, pStart };
}

/** Win chance (0–100) for `team` after ball k (k = -1 → before the first ball). */
export function chance(tl: Timeline, k: number, team: string): number {
  const p = k < 0 ? tl.pStart : tl.pFirst[k];
  const first = tl.meta.data.innings[0].team;
  return Math.round((team === first ? p : 1 - p) * 100);
}

export const oversText = (legalBalls: number) => `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

export function ballSymbol(b: Ball): string {
  if (b.wicket) return "W";
  if (b.extraType === "wides") return b.extras > 1 ? `${b.extras}wd` : "wd";
  if (b.extraType === "noballs") return b.runsBat ? `nb+${b.runsBat}` : "nb";
  if (b.extraType === "legbyes") return `${b.extras}lb`;
  if (b.extraType === "byes") return `${b.extras}b`;
  return b.runsBat === 0 ? "•" : String(b.runsBat);
}

export function nameOf(tl: Timeline, id: number, full = false): string {
  const raw = tl.meta.data.names[id];
  return full ? tl.meta.fullNames[raw] : tl.meta.shortNames[raw];
}

function fielderName(tl: Timeline, raw: string): string {
  return raw
    .split("/")
    .map((n) => tl.meta.shortNames[n] ?? n)
    .join("/");
}

export function dismissal(tl: Timeline, b: Ball): string {
  if (!b.wicket) return "";
  const bowler = nameOf(tl, b.bowler);
  const f = fielderName(tl, b.wicket.fielders);
  switch (b.wicket.kind) {
    case "caught":
      return f === bowler ? `c & b ${bowler}` : `c ${f} b ${bowler}`;
    case "caught and bowled":
      return `c & b ${bowler}`;
    case "bowled":
      return `b ${bowler}`;
    case "lbw":
      return `lbw b ${bowler}`;
    case "stumped":
      return `st ${f} b ${bowler}`;
    case "run out":
      return f ? `run out (${f})` : "run out";
    case "hit wicket":
      return `hit wicket b ${bowler}`;
    default:
      return b.wicket.kind;
  }
}

/** Ball index at the end of a given over (1-based) in an innings, or the innings end. */
export function indexAtOver(tl: Timeline, inn: number, overs: number): number {
  if (overs <= 0) return tl.innStart[inn] - 1;
  for (let i = tl.innStart[inn]; i <= tl.innEnd[inn]; i++) {
    const b = tl.balls[i];
    const next = tl.balls[i + 1];
    if (b.legalBalls === overs * 6 && (!next || next.inn !== inn || next.legalBalls > b.legalBalls)) return i;
  }
  return tl.innEnd[inn];
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export interface InningsCard {
  inn: number;
  team: string;
  score: number;
  wkts: number;
  legalBalls: number;
  extras: number;
  batting: BatterLine[];
  bowling: BowlerLine[];
  complete: boolean;
}

function walkInnings(tl: Timeline, inn: number, upTo: number, onBall?: (b: Ball, bat: Map<number, BatterLine>) => void) {
  const bat = new Map<number, BatterLine>();
  const bowl = new Map<number, BowlerLine>();
  const line = (id: number) => {
    if (!bat.has(id)) bat.set(id, { id, runs: 0, balls: 0, fours: 0, sixes: 0 });
    return bat.get(id)!;
  };
  let extras = 0;
  const end = Math.min(upTo, tl.innEnd[inn]);
  for (let i = tl.innStart[inn]; i <= end; i++) {
    const b = tl.balls[i];
    const striker = line(b.batter);
    line(b.nonStriker);
    striker.runs += b.runsBat;
    if (b.extraType !== "wides") striker.balls++;
    if (b.runsBat === 4) striker.fours++;
    if (b.runsBat === 6) striker.sixes++;
    extras += b.extras;
    if (!bowl.has(b.bowler)) bowl.set(b.bowler, { id: b.bowler, balls: 0, runs: 0, wkts: 0, dots: 0 });
    const bw = bowl.get(b.bowler)!;
    if (b.legal) bw.balls++;
    bw.runs += b.runsBat + (b.extraType === "wides" || b.extraType === "noballs" ? b.extras : 0);
    if (b.total === 0 && b.legal) bw.dots++;
    if (b.wicket) {
      line(b.wicket.out).out = dismissal(tl, b);
      if (!NOT_BOWLERS_WICKET.has(b.wicket.kind)) bw.wkts++;
    }
    onBall?.(b, bat);
  }
  return { bat, bowl, extras, last: tl.balls[end] };
}

export function scorecardAt(tl: Timeline, k: number): InningsCard[] {
  const cards: InningsCard[] = [];
  tl.meta.data.innings.forEach((inn, ii) => {
    if (tl.innStart[ii] > k) return;
    const { bat, bowl, extras, last } = walkInnings(tl, ii, k);
    cards.push({
      inn: ii,
      team: inn.team,
      score: last.score,
      wkts: last.wkts,
      legalBalls: last.legalBalls,
      extras,
      batting: [...bat.values()],
      bowling: [...bowl.values()],
      complete: k >= tl.innEnd[ii],
    });
  });
  return cards;
}

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------

function resultText(tl: Timeline): string {
  const o = tl.meta.data.outcome;
  if (!o.winner) return "Match tied / no result";
  if (o.by?.runs) return `${o.winner} won by ${o.by.runs} runs`;
  if (o.by?.wickets) return `${o.winner} won by ${o.by.wickets} wickets`;
  return `${o.winner} won`;
}

export function stateAt(tl: Timeline, k: number): MatchState {
  const { data } = tl.meta;
  const [first, second] = [data.innings[0].team, data.innings[1]?.team ?? data.teams.find((t) => t !== data.innings[0].team)!];
  const winChance = { [first]: chance(tl, k, first), [second]: chance(tl, k, second) };

  if (k < 0) {
    const b0 = tl.balls[0];
    return {
      k, inn: 0, batting: first, bowling: second, score: 0, wkts: 0, legalBalls: 0, oversText: "0.0",
      crr: 0, target: null, need: null, ballsLeft: tl.maxBalls, rrr: null, phase: "Powerplay",
      atCrease: [
        { id: b0.batter, runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: true },
        { id: b0.nonStriker, runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: false },
      ],
      bowler: null, partnership: { runs: 0, balls: 0 }, thisOver: [], firstInnings: null,
      winChance, inningsOver: false, matchOver: false, result: null,
    };
  }

  const ball = tl.balls[k];
  const inn = ball.inn;
  const inningsOver = k === tl.innEnd[inn];
  const matchOver = inningsOver && inn === data.innings.length - 1;
  let partnership = { runs: 0, balls: 0 };
  const { bat, bowl } = walkInnings(tl, inn, k, (b) => {
    partnership.runs += b.total;
    if (b.legal) partnership.balls++;
    if (b.wicket) partnership = { runs: 0, balls: 0 };
  });

  const next = tl.balls[k + 1];
  let pair: { id: number; onStrike: boolean }[];
  if (!inningsOver && next && next.inn === inn) {
    pair = [
      { id: next.batter, onStrike: true },
      { id: next.nonStriker, onStrike: false },
    ];
  } else {
    pair = [ball.batter, ball.nonStriker]
      .filter((id) => id !== ball.wicket?.out)
      .map((id) => ({ id, onStrike: id === ball.batter }));
  }
  const atCrease = pair.map((p) => ({
    ...(bat.get(p.id) ?? { id: p.id, runs: 0, balls: 0, fours: 0, sixes: 0 }),
    onStrike: p.onStrike,
  }));

  const target = inn === 1 ? data.innings[1].target?.runs ?? null : null;
  const ballsLeft = tl.maxBalls - ball.legalBalls;
  const need = target !== null ? target - ball.score : null;
  const upcomingOver = Math.floor(ball.legalBalls / 6) + 1;
  const phase = upcomingOver <= 6 ? "Powerplay" : upcomingOver <= 15 ? "Middle overs" : "Death overs";
  const thisOver: string[] = [];
  for (let i = tl.innStart[inn]; i <= k; i++) if (tl.balls[i].over === ball.over) thisOver.push(ballSymbol(tl.balls[i]));

  let firstInnings: MatchState["firstInnings"] = null;
  if (inn === 1) {
    const e = tl.balls[tl.innEnd[0]];
    firstInnings = { team: first, score: e.score, wkts: e.wkts, oversText: oversText(e.legalBalls) };
  }

  return {
    k,
    inn,
    batting: data.innings[inn].team,
    bowling: inn === 0 ? second : first,
    score: ball.score,
    wkts: ball.wkts,
    legalBalls: ball.legalBalls,
    oversText: oversText(ball.legalBalls),
    crr: ball.legalBalls ? (ball.score * 6) / ball.legalBalls : 0,
    target,
    need,
    ballsLeft,
    rrr: need !== null && ballsLeft > 0 ? (need * 6) / ballsLeft : null,
    phase,
    atCrease,
    bowler: bowl.get(ball.bowler) ?? null,
    partnership,
    thisOver,
    firstInnings,
    winChance,
    inningsOver,
    matchOver,
    result: matchOver ? resultText(tl) : null,
  };
}

// ---------------------------------------------------------------------------
// What happened between `from` and `to` (balls from+1 … to)
// ---------------------------------------------------------------------------

export function summarizeWindow(tl: Timeline, from: number, to: number, focusTeam: string): WindowSummary {
  const { data } = tl.meta;
  const moments: KeyMoment[] = [];
  const overs: OverSummary[] = [];
  let runs = 0, wkts = 0, fours = 0, sixes = 0, extras = 0, legal = 0;
  const batW = new Map<string, Map<number, BatterLine>>();
  const bowlW = new Map<string, Map<number, BowlerLine>>();
  const crossedInnings = from < tl.innEnd[0] && to > tl.innEnd[0];

  for (let inn = 0; inn < data.innings.length; inn++) {
    const s = Math.max(from + 1, tl.innStart[inn]);
    const e = Math.min(to, tl.innEnd[inn]);
    if (s > e) continue;
    const team = data.innings[inn].team;
    const bowlingTeam = data.teams.find((t) => t !== team)!;
    if (!batW.has(team)) batW.set(team, new Map());
    if (!bowlW.has(bowlingTeam)) bowlW.set(bowlingTeam, new Map());
    const bm = batW.get(team)!;
    const wm = bowlW.get(bowlingTeam)!;
    let pship = 0;

    walkInnings(tl, inn, e, (b, totals) => {
      const inWindow = b.i >= s;
      pship += b.total;
      const prevP = pship - b.total;
      if (inWindow) {
        runs += b.total;
        extras += b.extras;
        if (b.legal) legal++;
        if (b.runsBat === 4) fours++;
        if (b.runsBat === 6) sixes++;
        if (!bm.has(b.batter)) bm.set(b.batter, { id: b.batter, runs: 0, balls: 0, fours: 0, sixes: 0 });
        const bl = bm.get(b.batter)!;
        bl.runs += b.runsBat;
        if (b.extraType !== "wides") bl.balls++;
        if (b.runsBat === 4) bl.fours++;
        if (b.runsBat === 6) bl.sixes++;
        if (!wm.has(b.bowler)) wm.set(b.bowler, { id: b.bowler, balls: 0, runs: 0, wkts: 0, dots: 0 });
        const wl = wm.get(b.bowler)!;
        if (b.legal) wl.balls++;
        wl.runs += b.runsBat + (b.extraType === "wides" || b.extraType === "noballs" ? b.extras : 0);
        if (b.total === 0 && b.legal) wl.dots++;

        const striker = totals.get(b.batter)!;
        if (b.wicket) {
          wkts++;
          if (!NOT_BOWLERS_WICKET.has(b.wicket.kind)) wl.wkts++;
          const out = totals.get(b.wicket.out)!;
          if (bm.has(b.wicket.out)) bm.get(b.wicket.out)!.out = dismissal(tl, b);
          moments.push({
            i: b.i, label: b.label, inn, kind: "wicket",
            text: `WICKET: ${nameOf(tl, b.wicket.out)} ${dismissal(tl, b)}, ${out.runs} (${out.balls}). ${team} ${b.score}/${b.wkts}`,
          });
        }
        if (b.runsBat === 6) {
          moments.push({ i: b.i, label: b.label, inn, kind: "six", text: `SIX: ${nameOf(tl, b.batter)} off ${nameOf(tl, b.bowler)}` });
        }
        for (const m of [50, 100]) {
          if (striker.runs >= m && striker.runs - b.runsBat < m) {
            moments.push({
              i: b.i, label: b.label, inn, kind: "milestone",
              text: `${m === 50 ? "FIFTY" : "HUNDRED"}: ${nameOf(tl, b.batter)} reaches ${striker.runs} off ${striker.balls}`,
            });
          }
          if (!b.wicket && pship >= m && prevP < m) {
            moments.push({ i: b.i, label: b.label, inn, kind: "milestone", text: `${m}-run partnership` });
          }
        }
      }
      if (b.wicket) pship = 0;
    });

    // over-by-over
    let o = tl.balls[s].over;
    while (o <= tl.balls[e].over) {
      const inOver = tl.balls.filter((b) => b.inn === inn && b.over === o);
      const shown = inOver.filter((b) => b.i >= s && b.i <= e);
      if (shown.length) {
        const first = shown[0].i;
        const last = shown[shown.length - 1].i;
        const ov: OverSummary = {
          inn,
          overNo: o + 1,
          bowler: shown[0].bowler,
          runs: shown.reduce((a, b) => a + b.total, 0),
          wkts: shown.filter((b) => b.wicket).length,
          seq: shown.map(ballSymbol),
          partial: shown.length !== inOver.length,
          chanceBefore: chance(tl, first - 1, focusTeam),
          chanceAfter: chance(tl, last, focusTeam),
        };
        overs.push(ov);
        if (!ov.partial && ov.runs >= 15) {
          moments.push({ i: last, label: `Over ${o + 1}`, inn, kind: "bigover", text: `BIG OVER: ${ov.runs} off ${nameOf(tl, ov.bowler)} (${ov.seq.join(" ")})` });
        } else if (!ov.partial && ov.runs <= 4 && o >= 6) {
          moments.push({ i: last, label: `Over ${o + 1}`, inn, kind: "tightover", text: `TIGHT OVER: only ${ov.runs} off ${nameOf(tl, ov.bowler)}${ov.wkts ? ` and ${ov.wkts} wicket` : ""}` });
        }
      }
      o++;
    }

    if (inn === 0 && e === tl.innEnd[0] && to > e) {
      const last = tl.balls[e];
      moments.push({
        i: e, label: "Break", inn, kind: "break",
        text: `INNINGS BREAK: ${team} finished on ${last.score}/${last.wkts} (${oversText(last.legalBalls)}). Target ${last.score + 1}.`,
      });
    }
  }
  moments.sort((a, b) => a.i - b.i || (a.kind === "bigover" || a.kind === "tightover" ? 1 : -1));

  let turning: WindowSummary["turning"] = null;
  for (const ov of overs) {
    const delta = ov.chanceAfter - ov.chanceBefore;
    if (!turning || Math.abs(delta) > Math.abs(turning.delta)) {
      const batters = [...new Set(tl.balls.filter((b) => b.inn === ov.inn && b.over === ov.overNo - 1).map((b) => nameOf(tl, b.batter)))];
      turning = {
        overNo: ov.overNo,
        inn: ov.inn,
        delta,
        text: `Over ${ov.overNo} (${data.innings[ov.inn].team} batting; ${nameOf(tl, ov.bowler)} to ${batters.join(" & ")}): ${ov.seq.join(" ")}, ${ov.runs} runs${ov.wkts ? `, ${ov.wkts} wkt` : ""}. ${focusTeam} win chance ${ov.chanceBefore}% → ${ov.chanceAfter}%`,
      };
    }
  }

  return {
    from, to, balls: legal, runs, wkts, fours, sixes, extras, focusTeam,
    chanceFrom: chance(tl, from, focusTeam),
    chanceTo: chance(tl, to, focusTeam),
    overs, moments,
    batting: [...batW].map(([team, m]) => ({ team, lines: [...m.values()].sort((a, b) => b.runs - a.runs) })),
    bowling: [...bowlW].map(([team, m]) => ({ team, lines: [...m.values()].sort((a, b) => b.wkts - a.wkts || a.runs - b.runs) })),
    turning, crossedInnings,
  };
}

/** Index reached after `n` more overs (legal balls), possibly crossing the innings break. */
export function oversAhead(tl: Timeline, k: number, n: number): number {
  let legal = 0;
  for (let i = k + 1; i < tl.balls.length; i++) {
    if (tl.balls[i].legal) legal++;
    if (legal >= n * 6) return i;
  }
  return tl.balls.length - 1;
}

/** Index of the ball just before the last `n` overs ending at `to` (can cross the innings break). */
export function oversBack(tl: Timeline, to: number, n: number): number {
  let legal = 0;
  for (let i = to; i >= 0; i--) {
    if (tl.balls[i].legal) legal++;
    if (legal >= n * 6) return i - 1;
  }
  return -1;
}

/** Which team's win chance to track: the fan's team, else whoever is batting now. */
export function focusTeamFor(tl: Timeline, team: string, k: number): string {
  if (tl.meta.data.teams.includes(team)) return team;
  return tl.meta.data.innings[k < 0 ? 0 : tl.balls[k].inn].team;
}
