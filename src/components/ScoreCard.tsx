import { nameOf, oversText, type Timeline } from "../../shared/engine";
import type { MatchState } from "../../shared/types";

const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

function BallChip({ s }: { s: string }) {
  const cls = s === "W" ? "w" : s === "6" ? "six" : s === "4" ? "four" : s === "•" ? "dot" : /wd|nb|lb|b/.test(s) ? "extra" : "";
  return <span className={`ball ${cls}`}>{s}</span>;
}

export function WinBar({ tl, state }: { tl: Timeline; state: MatchState }) {
  const [a, b] = tl.meta.data.teams;
  const ca = state.winChance[a];
  return (
    <div className="winbar" aria-label={`Win chance: ${a} ${ca}%, ${b} ${100 - ca}%`}>
      <div className="winbar-labels">
        <span>
          {tl.meta.teams[a].code} <b>{ca}%</b>
        </span>
        <span className="muted small">win chance (est.)</span>
        <span>
          <b>{100 - ca}%</b> {tl.meta.teams[b].code}
        </span>
      </div>
      <div className="winbar-track">
        <div className="winbar-fill" style={{ width: `${ca}%`, background: tl.meta.teams[a].color }} />
        <div className="winbar-fill" style={{ width: `${100 - ca}%`, background: tl.meta.teams[b].color }} />
      </div>
    </div>
  );
}

export function ScoreCard({ tl, state }: { tl: Timeline; state: MatchState }) {
  const { meta } = tl;
  const rows = meta.data.innings.map((inn, ii) => {
    const style = meta.teams[inn.team];
    let score: string | null = null;
    if (ii < state.inn && state.firstInnings) score = `${state.firstInnings.score}/${state.firstInnings.wkts}`;
    else if (ii === state.inn && state.k >= 0) score = `${state.score}/${state.wkts}`;
    const sub =
      ii < state.inn && state.firstInnings
        ? `(${state.firstInnings.oversText})`
        : ii === state.inn && state.k >= 0
          ? `(${state.oversText})`
          : ii === state.inn
            ? "yet to bat"
            : state.inn === 0
              ? "yet to bat"
              : "";
    return { team: inn.team, style, score, sub, batting: ii === state.inn && !state.matchOver };
  });

  let situation: string;
  if (state.matchOver) situation = state.result ?? "";
  else if (state.inningsOver && state.inn === 0) situation = `Innings break · ${meta.data.innings[1].team} need ${state.score + 1} to win`;
  else if (state.need !== null) situation = `Need ${state.need} off ${state.ballsLeft} · RRR ${state.rrr?.toFixed(2)}`;
  else if (state.k < 0) situation = `${meta.data.toss.winner} won the toss and chose to ${meta.data.toss.decision}`;
  else situation = `CRR ${state.crr.toFixed(2)} · ${state.phase}`;

  return (
    <section className="card score">
      <div className="score-top">
        <span className="live-pill">
          <i /> LIVE
        </span>
        <span className="muted small">{meta.subtitle}</span>
      </div>
      {rows.map((r) => (
        <div key={r.team} className={`team-row ${r.batting ? "batting" : ""}`}>
          <span className="flag">{r.style.flag}</span>
          <span className="team-name">{r.team}</span>
          {r.batting && <span className="bat-dot" title="batting" />}
          <span className="team-score">
            {r.score ?? ""} <span className="muted small">{r.sub}</span>
          </span>
        </div>
      ))}
      <div className="situation">{situation}</div>
      <WinBar tl={tl} state={state} />
      {!state.matchOver && state.k >= 0 && !state.inningsOver && (
        <div className="crease">
          <div className="crease-col">
            {state.atCrease.map((b) => (
              <div key={b.id} className="crease-line">
                <span>
                  {nameOf(tl, b.id)}
                  {b.onStrike && <span className="strike">*</span>}
                </span>
                <span className="num">
                  {b.runs} <span className="muted">({b.balls})</span>
                </span>
              </div>
            ))}
          </div>
          {state.bowler && (
            <div className="crease-col">
              <div className="crease-line">
                <span>{nameOf(tl, state.bowler.id)}</span>
                <span className="num">
                  {overs(state.bowler.balls)}-{state.bowler.runs}-{state.bowler.wkts}
                </span>
              </div>
              <div className="this-over">
                {state.thisOver.map((s, i) => (
                  <BallChip key={i} s={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {state.k >= 0 && state.inningsOver && !state.matchOver && (
        <div className="crease muted small">
          {meta.data.innings[0].team} {state.score}/{state.wkts} ({oversText(state.legalBalls)}) — chase starts next ball.
        </div>
      )}
    </section>
  );
}

export { BallChip };
