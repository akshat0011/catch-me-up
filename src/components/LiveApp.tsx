import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Coffee, FastForward, Lightning, Pause, Play, Train } from "@phosphor-icons/react";
import { MATCHES } from "../../shared/matches";
import {
  ballSymbol,
  buildTimeline,
  chance,
  dismissal,
  focusTeamFor,
  indexAtOver,
  nameOf,
  oversAhead,
  oversBack,
  stateAt,
  type Timeline,
} from "../../shared/engine";
import type { Prefs } from "../../shared/types";
import { load, save } from "../lib/storage";
import { CatchUp } from "./CatchUp";
import { ScoreCard } from "./ScoreCard";
import { BallChip, oversFromBalls } from "./ui";

export const TIMELINES: Timeline[] = MATCHES.map(buildTimeline);
const BALL_MS = 1600;

const AWAY_OPTIONS = [
  { Icon: Coffee, label: "Chai break", overs: 2 },
  { Icon: Train, label: "Commute", overs: 6 },
  { Icon: Briefcase, label: "Meeting", overs: 10 },
];

function describe(tl: Timeline, i: number): string {
  const b = tl.balls[i];
  const who = `${nameOf(tl, b.bowler)} to ${nameOf(tl, b.batter)}`;
  if (b.wicket) return `${who}, OUT. ${nameOf(tl, b.wicket.out)} ${dismissal(tl, b)}`;
  if (b.runsBat === 6) return `${who}, SIX`;
  if (b.runsBat === 4) return `${who}, FOUR`;
  if (b.extraType === "wides") return `${who}, wide`;
  if (b.extraType === "noballs") return `${who}, no-ball${b.runsBat ? ` and ${b.runsBat} off the bat` : ""}`;
  if (b.total === 0) return `${who}, no run`;
  return `${who}, ${b.total} run${b.total > 1 ? "s" : ""}${b.extraType ? ` (${b.extraType})` : ""}`;
}

/** The product itself: a live score screen with a replay clock, and the catch-up flow. */
export function LiveApp({ active }: { active: boolean }) {
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
  const screen = useRef<HTMLDivElement>(null);
  const hiddenAt = useRef<number | null>(null);
  const kRef = useRef(k);
  kRef.current = k;

  const updatePrefs = (patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      save("cmu-prefs", { lang: next.lang, vibe: next.vibe, team: next.team });
      return next;
    });

  function switchMatch(i: number) {
    const next = TIMELINES[i];
    setMatchIdx(i);
    setK(indexAtOver(next, next.meta.demoStart.inn, next.meta.demoStart.over));
    setAwayFrom(null);
    setPlaying(true);
    setView("live");
    setPrefsState((p) => ({ ...p, players: [], team: next.meta.data.teams.includes(p.team) ? p.team : "neutral" }));
  }

  // The "live" feed: one ball every ~1.6s while the demo is on screen.
  const last = tl.balls.length - 1;
  useEffect(() => {
    if (!active || !playing || view !== "live" || k >= last) return;
    const t = setTimeout(() => setK((x) => Math.min(x + 1, last)), fast ? BALL_MS / 5 : BALL_MS);
    return () => clearTimeout(t);
  }, [active, playing, view, k, last, fast]);

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

  function stepAway(n: number) {
    setAwayFrom(k);
    setK(oversAhead(tl, k, n));
    setPlaying(true);
  }

  function openCatchUp() {
    const f = awayFrom ?? oversBack(tl, k, 5);
    if (f >= k) return;
    setCatchFrom(f);
    setCatchTo(k);
    setPlaying(false);
    setView("catchup");
    screen.current?.scrollTo({ top: 0 });
  }

  const missed = awayFrom !== null && awayFrom < k ? tl.balls.slice(awayFrom + 1, k + 1) : null;
  const away = missed && {
    balls: missed.filter((b) => b.legal).length,
    wkts: missed.filter((b) => b.wicket).length,
    sixes: missed.filter((b) => b.runsBat === 6).length,
    from: chance(tl, awayFrom!, focus),
    to: chance(tl, k, focus),
  };

  const feed: number[] = [];
  for (let i = k; i >= 0 && feed.length < 5; i--) feed.push(i);

  return (
    <div className="app-screen" ref={screen}>
      {view === "catchup" ? (
        <CatchUp
          key={`${tl.meta.id}-${catchFrom}-${catchTo}`}
          tl={tl}
          initialFrom={catchFrom}
          awayFrom={awayFrom}
          to={catchTo}
          prefs={prefs}
          updatePrefs={updatePrefs}
          scrollTop={() => screen.current?.scrollTo({ top: 0 })}
          onClose={() => {
            setView("live");
            setAwayFrom(null);
            setPlaying(true);
            screen.current?.scrollTo({ top: 0 });
          }}
        />
      ) : (
        <div className="app-live">
          <header className="app-head">
            <span className="app-brand">
              <img src="/favicon.svg" alt="" width={22} height={22} />
              Catch Me Up
            </span>
            <div className="match-tabs" role="tablist" aria-label="Match">
              {TIMELINES.map((t, i) => (
                <button
                  key={t.meta.id}
                  role="tab"
                  aria-selected={i === matchIdx}
                  className={i === matchIdx ? "on" : ""}
                  onClick={() => switchMatch(i)}
                >
                  {t.meta.data.teams.map((team) => t.meta.teams[team].code).join(" v ")}
                </button>
              ))}
            </div>
          </header>

          <ScoreCard tl={tl} state={state} />

          {away && (
            <section className="app-card welcome">
              <div className="welcome-title">Welcome back</div>
              <p>
                You missed <b>{oversFromBalls(away.balls)} overs</b>: {away.wkts} wicket{away.wkts === 1 ? "" : "s"} and{" "}
                {away.sixes} six{away.sixes === 1 ? "" : "es"}. {focus} win chance went from {away.from}% to{" "}
                <b>{away.to}%</b>.
              </p>
              <button className="pill primary wide" onClick={openCatchUp}>
                <Lightning weight="fill" size={16} aria-hidden /> Catch me up
              </button>
            </section>
          )}

          <section className="app-card">
            <div className="card-title">Step away from the match</div>
            <div className="away-row">
              {AWAY_OPTIONS.map(({ Icon, label, overs }) => (
                <button key={label} className="away-btn" onClick={() => stepAway(overs)} disabled={k >= last}>
                  <Icon size={20} weight="light" aria-hidden />
                  <span>{label}</span>
                  <span className="dim">{overs} overs</span>
                </button>
              ))}
            </div>
            <p className="card-note">The match keeps going without you. Switching tabs for a while works too.</p>
          </section>

          <section className="app-card">
            <div className="feed-head">
              <span className="card-title">Ball by ball</span>
              <div className="feed-controls">
                <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause replay" : "Play replay"}>
                  {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                </button>
                <button
                  className={`icon-btn ${fast ? "on" : ""}`}
                  onClick={() => setFast((f) => !f)}
                  aria-label={fast ? "Normal speed" : "Fast forward"}
                  aria-pressed={fast}
                >
                  <FastForward size={14} weight="fill" />
                </button>
              </div>
            </div>
            <ol className="feed-list">
              {feed.map((i) => (
                <li key={i} className={i === k ? "latest" : ""}>
                  <span className="feed-label num">{tl.balls[i].label}</span>
                  <BallChip s={ballSymbol(tl.balls[i])} />
                  <span className="feed-text">{describe(tl, i)}</span>
                </li>
              ))}
            </ol>
            <label className="scrub">
              <span className="card-note">Jump to any moment</span>
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
            <p className="card-note">Real ball-by-ball data from this match, replayed as if it were live.</p>
          </section>

          <div className="app-sticky">
            <button className="pill primary wide big" onClick={openCatchUp} disabled={k < 1}>
              <Lightning weight="fill" size={18} aria-hidden />
              Catch me up
              <span className="pill-sub">{away ? "on what you missed" : "on the last 5 overs"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
