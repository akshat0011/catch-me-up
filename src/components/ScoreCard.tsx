import { nameOf, type Timeline } from "../../shared/engine";
import type { MatchState } from "../../shared/types";
import { BallChip, oversFromBalls, TeamBadge } from "./ui";

export function WinBar({ tl, state }: { tl: Timeline; state: MatchState }) {
  const [a, b] = tl.meta.data.teams;
  const ca = state.winChance[a];
  return (
    <div className="winbar" aria-label={`Win chance: ${a} ${ca}%, ${b} ${100 - ca}%`}>
      <div className="winbar-labels">
        <span className="num">
          {tl.meta.teams[a].code} <b>{ca}%</b>
        </span>
        <span className="winbar-caption">Win chance</span>
        <span className="num">
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
    let score: string | null = null;
    let sub = "Yet to bat";
    if (ii < state.inn && state.firstInnings) {
      score = `${state.firstInnings.score}/${state.firstInnings.wkts}`;
      sub = `${state.firstInnings.oversText} ov`;
    } else if (ii === state.inn && state.k >= 0) {
      score = `${state.score}/${state.wkts}`;
      sub = `${state.oversText} ov`;
    }
    return { team: inn.team, score, sub, batting: ii === state.inn && !state.matchOver };
  });

  let situation: string;
  if (state.matchOver) situation = state.result ?? "";
  else if (state.inningsOver && state.inn === 0) situation = `Innings break. ${meta.data.innings[1].team} need ${state.score + 1} to win`;
  else if (state.need !== null) situation = `Need ${state.need} off ${state.ballsLeft} balls, RRR ${state.rrr?.toFixed(2)}`;
  else if (state.k < 0) situation = `${meta.data.toss.winner} won the toss and chose to ${meta.data.toss.decision}`;
  else situation = `CRR ${state.crr.toFixed(2)}, ${state.phase.toLowerCase()}`;

  return (
    <section className="app-card score">
      <div className="score-top">
        <span className="live-pill">
          <i aria-hidden /> Live
        </span>
        <span className="score-event">{meta.subtitle}</span>
      </div>
      {rows.map((r) => (
        <div key={r.team} className={`team-row ${r.batting ? "batting" : ""}`}>
          <TeamBadge tl={tl} team={r.team} />
          <span className="team-name">{r.team}</span>
          <span className="team-score num">
            {r.score && <b>{r.score}</b>}
            <span className="team-sub">{r.sub}</span>
          </span>
        </div>
      ))}
      <div className="situation">{situation}</div>
      <WinBar tl={tl} state={state} />
      {!state.matchOver && state.k >= 0 && !state.inningsOver && (
        <div className="crease">
          <div>
            {state.atCrease.map((b) => (
              <div key={b.id} className="crease-line">
                <span className={b.onStrike ? "on-strike" : ""}>{nameOf(tl, b.id)}</span>
                <span className="num">
                  {b.runs} <span className="dim">({b.balls})</span>
                </span>
              </div>
            ))}
          </div>
          {state.bowler && (
            <div>
              <div className="crease-line">
                <span>{nameOf(tl, state.bowler.id)}</span>
                <span className="num">
                  {oversFromBalls(state.bowler.balls)}-{state.bowler.runs}-{state.bowler.wkts}
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
    </section>
  );
}
