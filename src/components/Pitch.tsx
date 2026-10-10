export function Pitch() {
  return (
    <aside className="pitch">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={36} height={36} />
        <div>
          <div className="brand-name">Catch Me Up</div>
          <div className="muted small">AI catch-up for live cricket</div>
        </div>
      </div>
      <h1>Stepped away from the match? Get back in the game in 20 seconds.</h1>

      <h4>The fan problem</h4>
      <p>
        Most fans don't watch every ball. Matches clash with work, commutes and chai breaks, so people check in and out.
        When they come back, the scoreboard says <b>142/5</b>. It doesn't say that India lost two wickets in six quiet
        overs and their win chance fell from 87% to 63%. So the fan either scrolls through 36 balls of commentary or
        stops caring and closes the app.
      </p>

      <h4>What Catch Me Up does</h4>
      <ul>
        <li>
          Tell it when you left. It rebuilds the <b>story</b> of what you missed: the headline, the turning point, the
          situation right now and what to watch next.
        </li>
        <li>
          In <b>your language and tone</b>: English, Hinglish, Hindi, Tamil, Telugu, Bengali, Marathi or Kannada,
          either as a 20-second gist, "Dost mode" banter or an analyst breakdown. About 90% of IPL 2026 watch-time was
          in Indian languages (JioStar).
        </li>
        <li>
          Personal: it leads with <b>your team</b> and tracks <b>your fantasy players</b>. You can listen to it on a
          commute, forward it to the group chat, or ask follow-ups.
        </li>
      </ul>

      <h4>Try it (30 seconds)</h4>
      <ol>
        <li>Pick a match. Each one replays real ball-by-ball data as if it were live.</li>
        <li>
          Tap <b>☕ Step away</b>. The match jumps ahead without you, just like real life.
        </li>
        <li>
          Tap <b>Catch me up</b>, then switch to <b>Hinglish</b> or <b>தமிழ்</b> and try <b>Dost mode</b>.
        </li>
        <li>Ask a follow-up, like "can we still win?"</li>
      </ol>

      <h4>How it works</h4>
      <p>
        A deterministic cricket engine turns ball-by-ball data into facts: score state, a DLS-style win-chance model,
        key moments and the biggest swing. <b>Gemini</b> then writes the story <i>only</i> from that fact sheet, and the
        response streams in. It never sees balls after "now", so it can't invent stats or spoil the match. If the AI is
        down, fans still get a data-only summary.
      </p>
      <p className="muted small">
        AI: Google Gemini API. Match data from{" "}
        <a href="https://cricsheet.org" target="_blank" rel="noreferrer">
          Cricsheet
        </a>{" "}
        (ODC-BY). This is an independent prototype made for a Dream11 internship application. It is not affiliated
        with or endorsed by Dream11.
      </p>
    </aside>
  );
}
