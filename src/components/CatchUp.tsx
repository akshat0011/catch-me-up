import { useEffect, useMemo, useRef, useState } from "react";
import { buildFacts } from "../../shared/context";
import { nameOf, oversText, scorecardAt, stateAt, type Timeline } from "../../shared/engine";
import { LANGS, parseRecap, VIBES, type Recap } from "../../shared/prompt";
import type { KeyMoment, Prefs } from "../../shared/types";
import { fallbackRecap } from "../lib/fallback";
import { canSpeak, speak, stopSpeaking } from "../lib/speech";
import { streamPost } from "../lib/stream";
import { Momentum } from "./Momentum";

const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Index of the ball just before the last `n` overs ending at `to` (can cross the innings break). */
function oversBack(tl: Timeline, to: number, n: number): number {
  let legal = 0;
  for (let i = to; i >= 0; i--) {
    if (tl.balls[i].legal) legal++;
    if (legal >= n * 6) return i - 1;
  }
  return -1;
}

const MOMENT_ICON: Record<KeyMoment["kind"], string> = {
  wicket: "W",
  six: "6",
  four: "4",
  bigover: "⚡",
  tightover: "🧱",
  milestone: "★",
  break: "⏸",
};

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
  setPrefs,
  onClose,
}: {
  tl: Timeline;
  initialFrom: number;
  awayFrom: number | null;
  to: number;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  onClose: () => void;
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
            ? "The AI couldn't finish this one — here's the data-only version."
            : res.error === "rate_limited"
              ? "Lots of catch-ups right now — here's the data-only version."
              : "AI is offline right now — here's the data-only version.",
        );
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    stopSpeaking();
    askAbort.current?.abort();
  }, []);

  const recapPlain = [
    recap.headline,
    ...recap.recap,
    recap.turning && `⚡ ${recap.turning}`,
    recap.now && `📍 ${recap.now}`,
  ]
    .filter(Boolean)
    .join("\n");

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
    const msg = `🏏 ${tl.meta.title} — what I missed (${overs(w.balls)} ov)\n\n${recap.headline}\n${recap.recap.map((r) => `• ${r}`).join("\n")}\n📍 ${recap.now}\n\nvia Catch Me Up`;
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
            ? { ...x, a: res.text, status: "done" }
            : { ...x, a: res.text || "Couldn't reach the AI just now — try again in a moment.", status: "error" }
          : x,
      ),
    );
  }

  // From-point options
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
  const fromLabel = from < 0 ? "the start" : `${tl.meta.data.innings[then.inn].team} ${then.score}/${then.wkts} (${then.oversText})`;
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
          ←
        </button>
        <div className="cu-head-text">
          <div className="eyebrow">While you were away</div>
          <button className="range-btn" onClick={() => setPickFrom((v) => !v)}>
            {from < 0 ? "Start" : then.oversText} → {now.oversText} ov · {w.balls} balls <span className="caret">▾</span>
          </button>
        </div>
        <span className="live-pill small-pill">
          <i /> LIVE
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
              onClick={() => setPrefs({ ...prefs, lang: l.id })}
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
              onClick={() => setPrefs({ ...prefs, vibe: v.id })}
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={() => setShowMore((v) => !v)}>
          {prefs.team === "neutral" ? "Neutral" : `${tl.meta.teams[prefs.team].flag} ${prefs.team} fan`}
          {prefs.players.length ? ` · following ${prefs.players.map((p) => nameOf(tl, p)).join(", ")}` : " · follow your players"}{" "}
          <span className="caret">{showMore ? "▴" : "▾"}</span>
        </button>
        {showMore && (
          <div className="more">
            <div className="label">I'm supporting</div>
            <div className="seg">
              {[teamA, teamB, "neutral"].map((t) => (
                <button key={t} className={prefs.team === t ? "on" : ""} onClick={() => setPrefs({ ...prefs, team: t })}>
                  {t === "neutral" ? "Neutral" : `${tl.meta.teams[t].flag} ${tl.meta.teams[t].code}`}
                </button>
              ))}
            </div>
            <div className="label">My players (fantasy picks, up to 3)</div>
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
                        setPrefs({ ...prefs, players: on ? prefs.players.filter((p) => p !== id) : [...prefs.players, id] })
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

      <section className="card stats">
        <div className="stat-grid">
          <div>
            <b>{w.runs}</b>
            <span>runs</span>
          </div>
          <div>
            <b>{w.wkts}</b>
            <span>wickets</span>
          </div>
          <div>
            <b>{w.fours}</b>
            <span>fours</span>
          </div>
          <div>
            <b>{w.sixes}</b>
            <span>sixes</span>
          </div>
        </div>
        <div className="swing">
          <span>
            {tl.meta.teams[w.focusTeam].flag} {w.focusTeam} win chance
          </span>
          <span className="swing-nums">
            {w.chanceFrom}% → <b>{w.chanceTo}%</b>
            <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}
            </span>
          </span>
        </div>
        <div className="muted small">You left at {fromLabel}.</div>
        <Momentum tl={tl} w={w} />
      </section>

      <section className={`card recap ${status}`} aria-live="polite">
        <div className="recap-badge">
          <span className="ai-dot" /> {status === "fallback" ? "Data-only summary" : "AI catch-up"} · {lang.native}
        </div>
        {notice && <div className="notice">{notice}</div>}
        {status === "loading" && (
          <div className="skeleton">
            <div className="muted small">Rewinding {w.balls} balls…</div>
            <span />
            <span />
            <span className="short" />
          </div>
        )}
        {recap.headline && <h2 className="headline">{recap.headline}</h2>}
        {recap.recap.length > 0 && (
          <ul className="bullets">
            {recap.recap.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {recap.turning && (
          <div className="callout turn">
            <div className="callout-label">⚡ Turning point</div>
            <p>{recap.turning}</p>
          </div>
        )}
        {recap.now && (
          <div className="callout now">
            <div className="callout-label">📍 Right now</div>
            <p>{recap.now}</p>
          </div>
        )}
        {recap.next.length > 0 && (
          <div className="next">
            <div className="callout-label">👀 Watch next</div>
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
              <button className="btn ghost" onClick={toggleSpeak}>
                {speaking ? "■ Stop" : "🔊 Listen"}
              </button>
            )}
            <button className="btn ghost" onClick={share}>
              ↗ Share
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                cache.current.delete(key);
                setNonce((n) => n + 1);
              }}
            >
              ↻ Redo
            </button>
          </div>
        )}
      </section>

      {prefs.players.length > 0 && (
        <section className="card players">
          <h3>Your players</h3>
          {prefs.players.map((p) => {
            const lines: string[] = [];
            for (const c of cards) {
              const bat = c.batting.find((b) => b.id === p);
              if (bat) lines.push(`🏏 ${bat.runs} (${bat.balls})${bat.out ? ` · ${bat.out}` : c.complete ? " not out" : "*"}`);
              const bowl = c.bowling.find((b) => b.id === p);
              if (bowl) lines.push(`🎯 ${overs(bowl.balls)}-${bowl.runs}-${bowl.wkts}`);
            }
            const inWin = w.batting.flatMap((t) => t.lines).find((b) => b.id === p);
            const inWinBowl = w.bowling.flatMap((t) => t.lines).find((b) => b.id === p);
            return (
              <div key={p} className="player-line">
                <span className="pname">{nameOf(tl, p, true)}</span>
                <span className="pstats">{lines.join("  ") || "Yet to bat or bowl"}</span>
                {(inWin || inWinBowl) && (
                  <span className="muted small">
                    While away: {inWin ? `${inWin.runs} off ${inWin.balls}` : ""}
                    {inWin && inWinBowl ? " · " : ""}
                    {inWinBowl ? `${overs(inWinBowl.balls)}-${inWinBowl.runs}-${inWinBowl.wkts}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="card moments">
        <h3>Key moments you missed</h3>
        {w.moments.length === 0 && <p className="muted">No wickets or big overs — steady cricket.</p>}
        <ol>
          {moments.map((m, i) => (
            <li key={i} className={`m-${m.kind}`}>
              <span className="m-icon">{MOMENT_ICON[m.kind]}</span>
              <span className="m-label">{m.label}</span>
              <span className="m-text">{m.text}</span>
            </li>
          ))}
        </ol>
        {w.moments.length > 6 && (
          <button className="link-btn" onClick={() => setAllMoments((v) => !v)}>
            {allMoments ? "Show fewer" : `Show all ${w.moments.length}`}
          </button>
        )}
      </section>

      <section className="card ask">
        <h3>Ask about what you missed</h3>
        <div className="qa">
          {qa.map((x, i) => (
            <div key={i} className="qa-pair">
              <div className="q">{x.q}</div>
              <div className={`a ${x.status}`}>{x.a || <span className="typing">thinking…</span>}</div>
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
          <input
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask in any language…`}
            aria-label="Ask a question about the match"
          />
          <button className="btn" disabled={!question.trim()}>
            Ask
          </button>
        </form>
      </section>

      <section className="facts">
        <button className="link-btn" onClick={() => setShowFacts((v) => !v)}>
          {showFacts ? "Hide" : "Show"} the facts the AI was given {showFacts ? "▴" : "▾"}
        </button>
        {showFacts && (
          <>
            <p className="muted small">
              The AI only sees this fact sheet, built from ball-by-ball data up to {oversText(now.legalBalls)} overs. It
              never sees future balls, so it can't spoil the match.
            </p>
            <pre>{facts}</pre>
          </>
        )}
      </section>

      <div className="sticky-back">
        <button className="btn primary wide" onClick={onClose}>
          Back to live ▸
        </button>
      </div>
    </div>
  );
}
