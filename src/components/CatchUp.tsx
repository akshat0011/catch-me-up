import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowLeft,
  CaretDown,
  CaretUp,
  Crosshair,
  Eye,
  Lightning,
  Pause,
  ShareNetwork,
  ShieldCheck,
  SpeakerHigh,
  Star,
  Stop,
} from "@phosphor-icons/react";
import { buildFacts } from "../../shared/context";
import { nameOf, oversBack, oversText, scorecardAt, stateAt, type Timeline } from "../../shared/engine";
import { LANGS, parseRecap, VIBES, type Recap } from "../../shared/prompt";
import type { KeyMoment, Prefs } from "../../shared/types";
import { fallbackRecap } from "../lib/fallback";
import { canSpeak, speak, stopSpeaking } from "../lib/speech";
import { streamPost } from "../lib/stream";
import { Momentum } from "./Momentum";
import { oversFromBalls, TeamBadge } from "./ui";

const MOMENT_LABEL: Record<KeyMoment["kind"], string> = {
  wicket: "Wicket",
  six: "Six",
  four: "Four",
  bigover: "Big over",
  tightover: "Tight over",
  milestone: "Milestone",
  break: "Innings break",
};

function MomentIcon({ kind }: { kind: KeyMoment["kind"] }) {
  if (kind === "wicket") return <span className="m-icon w">W</span>;
  if (kind === "six") return <span className="m-icon six">6</span>;
  if (kind === "four") return <span className="m-icon">4</span>;
  const Icon = kind === "bigover" ? Lightning : kind === "tightover" ? ShieldCheck : kind === "milestone" ? Star : Pause;
  return (
    <span className="m-icon">
      <Icon size={12} weight="fill" aria-hidden />
    </span>
  );
}

type Status = "loading" | "streaming" | "done" | "fallback";

interface QA {
  q: string;
  a: string;
  status: "streaming" | "done" | "error";
}

export function CatchUp({
  tl,
  initialFrom,
  awayFrom,
  to,
  prefs,
  updatePrefs,
  onClose,
  scrollTop,
}: {
  tl: Timeline;
  initialFrom: number;
  awayFrom: number | null;
  to: number;
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => void;
  onClose: () => void;
  scrollTop: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [allMoments, setAllMoments] = useState(false);
  const [pickFrom, setPickFrom] = useState(false);
  const [qa, setQa] = useState<QA[]>([]);
  const [question, setQuestion] = useState("");
  const [nonce, setNonce] = useState(0);
  const cache = useRef(new Map<string, string>());
  const askAbort = useRef<AbortController | null>(null);

  const { facts, w, now } = useMemo(() => buildFacts(tl, from, to, prefs), [tl, from, to, prefs]);
  const then = useMemo(() => stateAt(tl, from), [tl, from]);
  const fallback = useMemo(() => fallbackRecap(tl, w, now), [tl, w, now]);
  const recap: Recap = status === "fallback" ? fallback : parseRecap(text);
  const lang = LANGS.find((l) => l.id === prefs.lang)!;
  const key = JSON.stringify([tl.meta.id, from, to, prefs]);

  // (Re)generate whenever the window or preferences change; cached per combination.
  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    const hit = cache.current.get(key);
    if (hit) {
      setText(hit);
      setStatus("done");
      setNotice(null);
      return;
    }
    const ctrl = new AbortController();
    setText("");
    setStatus("loading");
    setNotice(null);
    const t = setTimeout(async () => {
      const res = await streamPost(
        "/api/catchup",
        { matchId: tl.meta.id, from, to, prefs },
        (full) => {
          setText(full);
          setStatus("streaming");
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (res.ok && parseRecap(res.text).headline) {
        cache.current.set(key, res.text);
        setText(res.text);
        setStatus("done");
      } else {
        setStatus("fallback");
        setNotice(
          res.ok || res.error === "model_error"
            ? "The AI couldn't finish this one, so here is the data-only version."
            : res.error === "rate_limited"
              ? "Lots of catch-ups right now, so here is the data-only version."
              : "The AI is offline right now, so here is the data-only version.",
        );
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      stopSpeaking();
      askAbort.current?.abort();
    },
    [],
  );

  const recapPlain = [recap.headline, ...recap.recap, recap.turning, recap.now].filter(Boolean).join("\n");

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(recapPlain, lang.speech, () => setSpeaking(false));
  }

  function share() {
    const msg = `${tl.meta.title}: what I missed (${oversFromBalls(w.balls)} overs)\n\n${recap.headline}\n${recap.recap.map((r) => `- ${r}`).join("\n")}\nRight now: ${recap.now}\n\nvia Catch Me Up`;
    if (navigator.share) navigator.share({ text: msg }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  async function ask(q: string) {
    const clean = q.trim().slice(0, 300);
    if (!clean || qa.some((x) => x.status === "streaming")) return;
    setQuestion("");
    const history = qa.filter((x) => x.status === "done").map(({ q, a }) => ({ q, a }));
    const idx = qa.length;
    setQa((prev) => [...prev, { q: clean, a: "", status: "streaming" }]);
    askAbort.current = new AbortController();
    const res = await streamPost(
      "/api/ask",
      { matchId: tl.meta.id, from, to, prefs, question: clean, history },
      (full) => setQa((prev) => prev.map((x, i) => (i === idx ? { ...x, a: full } : x))),
      askAbort.current.signal,
    );
    setQa((prev) =>
      prev.map((x, i) =>
        i === idx
          ? res.ok
            ? { ...x, a: res.text.replace(/\s*[—–]\s*/g, ", "), status: "done" }
            : { ...x, a: res.text || "Couldn't reach the AI just now. Try again in a moment.", status: "error" }
          : x,
      ),
    );
  }

  const fromOptions: { label: string; idx: number }[] = [];
  if (awayFrom !== null && awayFrom < to) fromOptions.push({ label: "Since I left", idx: awayFrom });
  for (const n of [2, 5]) {
    const idx = oversBack(tl, to, n);
    if (idx > -1 && idx < to) fromOptions.push({ label: `Last ${n} overs`, idx });
  }
  if (tl.balls[to].inn === 1) fromOptions.push({ label: "Since innings break", idx: tl.innEnd[0] });
  fromOptions.push({ label: "Whole match", idx: -1 });

  const [teamA, teamB] = tl.meta.data.teams;
  const delta = w.chanceTo - w.chanceFrom;
  const moments = allMoments ? w.moments : w.moments.slice(-6);
  const cards = scorecardAt(tl, to);
  const fromLabel =
    from < 0 ? "the start" : `${tl.meta.data.innings[then.inn].team} ${then.score}/${then.wkts} (${then.oversText} ov)`;
  const suggestions = [
    `Can ${w.focusTeam} still win from here?`,
    "Who's been the best bowler while I was away?",
    "Why did the turning point matter so much?",
    ...prefs.players.slice(0, 1).map((p) => `How has ${nameOf(tl, p, true)} done so far?`),
  ];

  return (
    <div className="catchup">
      <header className="cu-head">
        <button className="icon-btn" onClick={onClose} aria-label="Back to live">
          <ArrowLeft size={16} />
        </button>
        <div className="cu-head-text">
          <div className="cu-kicker">While you were away</div>
          <button className="range-btn" onClick={() => setPickFrom((v) => !v)} aria-expanded={pickFrom}>
            {from < 0 ? "Start" : then.oversText} to {now.oversText} ov, {w.balls} balls
            {pickFrom ? <CaretUp size={12} /> : <CaretDown size={12} />}
          </button>
        </div>
        <span className="live-pill">
          <i aria-hidden /> Live
        </span>
      </header>

      {pickFrom && (
        <div className="chip-row wrap">
          {fromOptions.map((o) => (
            <button
              key={o.label}
              className={`chip ${o.idx === from ? "on" : ""}`}
              onClick={() => {
                setFrom(o.idx);
                setPickFrom(false);
                setQa([]);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <section className="prefs">
        <div className="chip-row scroll" role="radiogroup" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={prefs.lang === l.id}
              className={`chip ${prefs.lang === l.id ? "on" : ""}`}
              onClick={() => updatePrefs({ lang: l.id })}
            >
              {l.native}
            </button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Style">
          {VIBES.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={prefs.vibe === v.id}
              className={prefs.vibe === v.id ? "on" : ""}
              onClick={() => updatePrefs({ vibe: v.id })}
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          {prefs.team === "neutral" ? "Neutral fan" : `${prefs.team} fan`}
          {prefs.players.length
            ? `, following ${prefs.players.map((p) => nameOf(tl, p)).join(", ")}`
            : ", follow your players"}
          {showMore ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </button>
        {showMore && (
          <div className="more">
            <div className="field-label">I'm supporting</div>
            <div className="seg">
              {[teamA, teamB, "neutral"].map((t) => (
                <button key={t} className={prefs.team === t ? "on" : ""} onClick={() => updatePrefs({ team: t })}>
                  {t === "neutral" ? "Neutral" : tl.meta.teams[t].code}
                </button>
              ))}
            </div>
            <div className="field-label">My players (fantasy picks, up to 3)</div>
            {tl.meta.data.teams.map((t) => (
              <div key={t} className="chip-row wrap">
                {tl.meta.data.squads[t].map((id) => {
                  const on = prefs.players.includes(id);
                  return (
                    <button
                      key={id}
                      className={`chip small ${on ? "on" : ""}`}
                      disabled={!on && prefs.players.length >= 3}
                      onClick={() =>
                        updatePrefs((cur) => ({
                          players: cur.players.includes(id)
                            ? cur.players.filter((p) => p !== id)
                            : [...cur.players, id].slice(0, 3),
                        }))
                      }
                    >
                      {nameOf(tl, id)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="app-card cu-stats">
        <div className="stat-grid">
          {[
            [w.runs, "runs"],
            [w.wkts, "wickets"],
            [w.fours, "fours"],
            [w.sixes, "sixes"],
          ].map(([n, label]) => (
            <div key={label}>
              <b className="num">{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="swing">
          <span className="swing-team">
            <TeamBadge tl={tl} team={w.focusTeam} size="sm" /> win chance
          </span>
          <span className="swing-nums num">
            {w.chanceFrom}% <span className="dim">to</span> <b>{w.chanceTo}%</b>
            <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </span>
        </div>
        <div className="card-note">You left at {fromLabel}.</div>
        <Momentum tl={tl} w={w} />
      </section>

      <section className={`app-card recap ${status}`} aria-live="polite" aria-busy={status === "loading" || status === "streaming"}>
        <div className="recap-badge">
          <span className="ai-dot" aria-hidden />
          {status === "fallback" ? "Data-only summary" : "AI catch-up"}
          <span className="dim">{lang.native}</span>
        </div>
        {notice && <div className="notice">{notice}</div>}
        {status === "loading" && (
          <div className="skeleton" aria-label="Writing your catch-up">
            <span className="h" />
            <span />
            <span />
            <span className="short" />
          </div>
        )}
        {recap.headline && <h3 className="headline">{recap.headline}</h3>}
        {recap.recap.length > 0 && (
          <ul className="bullets">
            {recap.recap.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {recap.turning && (
          <div className="callout turn">
            <div className="callout-label">
              <Lightning size={13} weight="fill" aria-hidden /> Turning point
            </div>
            <p>{recap.turning}</p>
          </div>
        )}
        {recap.now && (
          <div className="callout">
            <div className="callout-label">
              <Crosshair size={13} weight="bold" aria-hidden /> Right now
            </div>
            <p>{recap.now}</p>
          </div>
        )}
        {recap.next.length > 0 && (
          <div className="next">
            <div className="callout-label">
              <Eye size={13} weight="bold" aria-hidden /> Watch next
            </div>
            <ul className="bullets">
              {recap.next.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {(status === "done" || status === "fallback") && (
          <div className="actions">
            {canSpeak() && (
              <button className="pill ghost" onClick={toggleSpeak}>
                {speaking ? <Stop size={14} weight="fill" /> : <SpeakerHigh size={14} />}
                {speaking ? "Stop" : "Listen"}
              </button>
            )}
            <button className="pill ghost" onClick={share}>
              <ShareNetwork size={14} /> Share
            </button>
            <button
              className="pill ghost"
              onClick={() => {
                cache.current.delete(key);
                setNonce((n) => n + 1);
              }}
            >
              <ArrowClockwise size={14} /> Redo
            </button>
          </div>
        )}
      </section>

      {prefs.players.length > 0 && (
        <section className="app-card players">
          <div className="card-title">Your players</div>
          {prefs.players.map((p) => {
            const lines: string[] = [];
            for (const c of cards) {
              const bat = c.batting.find((b) => b.id === p);
              if (bat) lines.push(`Bat ${bat.runs} (${bat.balls})${bat.out ? `, ${bat.out}` : c.complete ? " not out" : "*"}`);
              const bowl = c.bowling.find((b) => b.id === p);
              if (bowl) lines.push(`Bowl ${oversFromBalls(bowl.balls)}-${bowl.runs}-${bowl.wkts}`);
            }
            const inWin = w.batting.flatMap((t) => t.lines).find((b) => b.id === p);
            const inWinBowl = w.bowling.flatMap((t) => t.lines).find((b) => b.id === p);
            return (
              <div key={p} className="player-line">
                <span className="pname">{nameOf(tl, p, true)}</span>
                <span className="pstats num">{lines.join("   ") || "Yet to bat or bowl"}</span>
                {(inWin || inWinBowl) && (
                  <span className="card-note">
                    While you were away: {inWin ? `${inWin.runs} off ${inWin.balls}` : ""}
                    {inWin && inWinBowl ? ", " : ""}
                    {inWinBowl ? `${oversFromBalls(inWinBowl.balls)}-${inWinBowl.runs}-${inWinBowl.wkts}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="app-card moments">
        <div className="card-title">Key moments you missed</div>
        {w.moments.length === 0 && <p className="card-note">No wickets or big overs. Steady cricket.</p>}
        <ol>
          {moments.map((m, i) => (
            <li key={i}>
              <MomentIcon kind={m.kind} />
              <span className="m-label num">{m.label}</span>
              <span className="m-text">
                <b>{MOMENT_LABEL[m.kind]}.</b> {m.text.replace(/^[A-Z][A-Z -]+: /, "")}
              </span>
            </li>
          ))}
        </ol>
        {w.moments.length > 6 && (
          <button className="link-btn" onClick={() => setAllMoments((v) => !v)}>
            {allMoments ? "Show fewer" : `Show all ${w.moments.length}`}
          </button>
        )}
      </section>

      <section className="app-card ask">
        <div className="card-title">Ask about what you missed</div>
        <div className="qa">
          {qa.map((x, i) => (
            <div key={i} className="qa-pair">
              <div className="q">{x.q}</div>
              <div className={`a ${x.status}`}>{x.a || <span className="typing">Thinking</span>}</div>
            </div>
          ))}
        </div>
        <div className="chip-row wrap">
          {suggestions
            .filter((s) => !qa.some((x) => x.q === s))
            .map((s) => (
              <button key={s} className="chip small" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
        </div>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="ask-input">
            Ask a question about the match
          </label>
          <input
            id="ask-input"
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask in any language"
          />
          <button className="pill primary" disabled={!question.trim()}>
            Ask
          </button>
        </form>
      </section>

      <section className="facts">
        <button className="link-btn" onClick={() => setShowFacts((v) => !v)} aria-expanded={showFacts}>
          {showFacts ? "Hide" : "Show"} the facts the AI was given
          {showFacts ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </button>
        {showFacts && (
          <>
            <p className="card-note">
              The AI only sees this fact sheet, built from ball-by-ball data up to {oversText(now.legalBalls)} overs. It never
              sees later balls, so it can't spoil the match.
            </p>
            <pre>{facts}</pre>
          </>
        )}
      </section>

      <div className="app-sticky">
        <button
          className="pill light wide"
          onClick={() => {
            scrollTop();
            onClose();
          }}
        >
          Back to live
        </button>
      </div>
    </div>
  );
}
