import { useEffect, useMemo, useRef, useState } from "react";
import { MATCHES } from "../shared/matches";
import {
  ballSymbol,
  buildTimeline,
  chance,
  dismissal,
  focusTeamFor,
  indexAtOver,
  nameOf,
  stateAt,
  type Timeline,
} from "../shared/engine";
import type { Prefs } from "../shared/types";
import { CatchUp } from "./components/CatchUp";
import { Pitch } from "./components/Pitch";
import { ScoreCard } from "./components/ScoreCard";
import { load, save } from "./lib/storage";

const TIMELINES: Timeline[] = MATCHES.map(buildTimeline);
const BALL_MS = 1600;

const AWAY_OPTIONS = [
  { emoji: "☕", label: "Chai break", overs: 2 },
  { emoji: "🚇", label: "Commute", overs: 6 },
  { emoji: "💼", label: "Meeting", overs: 10 },
];

/** Index reached after `n` more overs (legal balls), possibly crossing the innings break. */
function oversAhead(tl: Timeline, k: number, n: number): number {
  let legal = 0;
  for (let i = k + 1; i < tl.balls.length; i++) {
    if (tl.balls[i].legal) legal++;
    if (legal >= n * 6) return i;
  }
  return tl.balls.length - 1;
}

function oversBack(tl: Timeline, to: number, n: number): number {
  let legal = 0;
  for (let i = to; i >= 0; i--) {
    if (tl.balls[i].legal) legal++;
    if (legal >= n * 6) return i - 1;
  }
  return -1;
}

function describe(tl: Timeline, i: number): string {
  const b = tl.balls[i];
  const who = `${nameOf(tl, b.bowler)} to ${nameOf(tl, b.batter)}`;
  if (b.wicket) return `${who} — OUT! ${nameOf(tl, b.wicket.out)} ${dismissal(tl, b)}`;
  if (b.runsBat === 6) return `${who} — SIX!`;
  if (b.runsBat === 4) return `${who} — FOUR`;
  if (b.extraType === "wides") return `${who} — wide`;
  if (b.extraType === "noballs") return `${who} — no-ball${b.runsBat ? `, ${b.runsBat} off the bat` : ""}`;
  if (b.total === 0) return `${who} — no run`;
  return `${who} — ${b.total} run${b.total > 1 ? "s" : ""}${b.extraType ? ` (${b.extraType})` : ""}`;
}

export default function App() {
  const [matchIdx, setMatchIdx] = useState(0);
  const tl = TIMELINES[matchIdx];
  const startK = useMemo(() => indexAtOver(tl, tl.meta.demoStart.inn, tl.meta.demoStart.over), [tl]);
  const [k, setK] = useState(startK);
  const [playing, setPlaying] = useState(true);
  const [fast, setFast] = useState(false);
  const [awayFrom, setAwayFrom] = useState<number | null>(null);
  const [view, setView] = useState<"live" | "catchup">("live");
  const [catchFrom, setCatchFrom] = useState(0);
  const [catchTo, setCatchTo] = useState(0);
  const [prefs, setPrefsState] = useState<Prefs>(() =>
    load<Prefs>("cmu-prefs", { lang: "en", vibe: "quick", team: "India", players: [] }),
  );
  const hiddenAt = useRef<number | null>(null);
  const kRef = useRef(k);
  kRef.current = k;

  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    save("cmu-prefs", { lang: p.lang, vibe: p.vibe, team: p.team });
  };

  function switchMatch(i: number) {
    const next = TIMELINES[i];
    setMatchIdx(i);
    setK(indexAtOver(next, next.meta.demoStart.inn, next.meta.demoStart.over));
    setAwayFrom(null);
    setPlaying(true);
    setView("live");
    setPrefsState((p) => ({ ...p, players: [], team: next.meta.data.teams.includes(p.team) ? p.team : "neutral" }));
  }

  // The "live" feed: one ball every ~1.6s while watching.
  const last = tl.balls.length - 1;
  useEffect(() => {
    if (!playing || view !== "live" || k >= last) return;
    const t = setTimeout(() => setK((x) => Math.min(x + 1, last)), fast ? BALL_MS / 5 : BALL_MS);
    return () => clearTimeout(t);
  }, [playing, view, k, last, fast]);

  // Real stepping away: if the tab is hidden while the match plays on, remember where you left.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = kRef.current;
      else if (hiddenAt.current !== null) {
        if (kRef.current - hiddenAt.current >= 6) setAwayFrom(hiddenAt.current);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const state = useMemo(() => stateAt(tl, k), [tl, k]);
  const focus = focusTeamFor(tl, prefs.team, k);

  function stepAway(overs: number) {
    setAwayFrom(k);
    setK(oversAhead(tl, k, overs));
    setPlaying(true);
  }

  function openCatchUp(from?: number) {
    const f = from ?? awayFrom ?? oversBack(tl, k, 5);
    if (f >= k) return;
    setCatchFrom(f);
    setCatchTo(k);
    setPlaying(false);
    setView("catchup");
    window.scrollTo({ top: 0 });
  }

  const away =
    awayFrom !== null && awayFrom < k
      ? {
          balls: tl.balls.slice(awayFrom + 1, k + 1).filter((b) => b.legal).length,
          wkts: tl.balls.slice(awayFrom + 1, k + 1).filter((b) => b.wicket).length,
          sixes: tl.balls.slice(awayFrom + 1, k + 1).filter((b) => b.runsBat === 6).length,
          from: chance(tl, awayFrom, focus),
          to: chance(tl, k, focus),
        }
      : null;

  const feed = [];
  for (let i = k; i >= 0 && feed.length < 5; i--) feed.push(i);

  return (
    <div className="layout">
      <div className="pitch-col">
        <Pitch />
      </div>
      <main className="phone">
        {view === "catchup" ? (
          <CatchUp
            key={`${tl.meta.id}-${catchFrom}-${catchTo}`}
            tl={tl}
            initialFrom={catchFrom}
            awayFrom={awayFrom}
            to={catchTo}
            prefs={prefs}
            setPrefs={setPrefs}
            onClose={() => {
              setView("live");
              setAwayFrom(null);
              setPlaying(true);
            }}
          />
        ) : (
          <div className="live">
            <header className="app-head">
              <div className="brand small-brand">
                <img src="/favicon.svg" alt="" width={26} height={26} />
                <span className="brand-name">Catch Me Up</span>
              </div>
              <div className="match-tabs" role="tablist">
                {TIMELINES.map((t, i) => (
                  <button
                    key={t.meta.id}
                    role="tab"
                    aria-selected={i === matchIdx}
                    className={i === matchIdx ? "on" : ""}
                    onClick={() => switchMatch(i)}
                  >
                    {Object.values(t.meta.teams)
                      .map((s) => s.code)
                      .join(" v ")}
                    <span>'{t.meta.data.date.slice(2, 4)}</span>
                  </button>
                ))}
              </div>
            </header>

            <ScoreCard tl={tl} state={state} />

            {away && (
              <section className="card welcome">
                <div className="welcome-title">👋 Welcome back</div>
                <p>
                  You missed <b>{Math.floor(away.balls / 6)}.{away.balls % 6} overs</b>: {away.wkts} wicket
                  {away.wkts === 1 ? "" : "s"}, {away.sixes} six{away.sixes === 1 ? "" : "es"}.{" "}
                  {tl.meta.teams[focus].flag} {focus} win chance {away.from}% → <b>{away.to}%</b>
                </p>
                <button className="btn primary wide" onClick={() => openCatchUp()}>
                  ⚡ Catch me up
                </button>
              </section>
            )}

            <section className="card away">
              <div className="away-title">Step away from the match</div>
              <div className="away-row">
                {AWAY_OPTIONS.map((o) => (
                  <button key={o.label} className="away-btn" onClick={() => stepAway(o.overs)} disabled={k >= last}>
                    <span className="away-emoji">{o.emoji}</span>
                    <span>{o.label}</span>
                    <span className="muted small">{o.overs} overs</span>
                  </button>
                ))}
              </div>
              <p className="muted small">
                The match keeps going without you, just like real life. You can also switch tabs for a while and come
                back.
              </p>
            </section>

            <section className="card feed">
              <div className="feed-head">
                <span>Ball by ball</span>
                <div className="feed-controls">
                  <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? "❚❚" : "▶"}
                  </button>
                  <button className={`icon-btn ${fast ? "on" : ""}`} onClick={() => setFast((f) => !f)} aria-label="Speed">
                    {fast ? "5×" : "1×"}
                  </button>
                </div>
              </div>
              <ol className="feed-list">
                {feed.map((i) => (
                  <li key={i} className={i === k ? "latest" : ""}>
                    <span className="feed-label">{tl.balls[i].label}</span>
                    <span className={`ball ${ballSymbol(tl.balls[i]) === "W" ? "w" : tl.balls[i].runsBat === 6 ? "six" : tl.balls[i].runsBat === 4 ? "four" : ""}`}>
                      {ballSymbol(tl.balls[i])}
                    </span>
                    <span className="feed-text">{describe(tl, i)}</span>
                  </li>
                ))}
              </ol>
              <label className="scrub">
                <span className="muted small">Jump to any moment</span>
                <input
                  type="range"
                  min={0}
                  max={last}
                  value={k}
                  onChange={(e) => {
                    setK(Number(e.target.value));
                    setAwayFrom(null);
                  }}
                />
              </label>
              <p className="muted small replay-note">
                Demo: real ball-by-ball data from this match, replayed as if it were live.
              </p>
            </section>

            <div className="sticky-cta">
              <button className="btn primary wide big" onClick={() => openCatchUp()} disabled={k < 1}>
                ⚡ Catch me up
                <span className="cta-sub">
                  {away ? "on what you missed" : "on the last 5 overs"}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
