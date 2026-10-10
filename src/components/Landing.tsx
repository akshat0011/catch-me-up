import { useMemo, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Database, ShieldCheck, Translate, Lifebuoy } from "@phosphor-icons/react";
import { buildFacts } from "../../shared/context";
import { indexAtOver } from "../../shared/engine";
import { useInView } from "../lib/useInView";
import { LiveApp, TIMELINES } from "./LiveApp";
import { ParticleBall } from "./ParticleBall";

const CTA = "Try the live demo";

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  return (
    <div ref={ref} className={`reveal ${inView ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Mark({ size = 24 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" width={size} height={size} className="mark" />;
}

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a href="#top" className="brand" aria-label="Catch Me Up, home">
          <Mark size={24} />
          <span>Catch Me Up</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#demo">Demo</a>
          <a href="#why">Why</a>
          <a href="#how">How it works</a>
        </nav>
        <a href="#demo" className="pill primary sm">
          {CTA}
        </a>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="hero" id="top">
      <ParticleBall className="hero-ball" />
      <div className="container hero-inner">
        <p className="eyebrow load-in">AI catch-up for live cricket</p>
        <h1 className="load-in d1">Missed the overs. Not the story.</h1>
        <p className="lede load-in d2">
          Step away from a live match, come back to a 20‑second recap of what changed. In your language.
        </p>
        <div className="cta-row load-in d3">
          <a href="#demo" className="pill primary">
            {CTA} <ArrowRight size={16} aria-hidden />
          </a>
          <a href="#how" className="pill secondary">
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["Step away", "Tap Chai break, Commute or Meeting. The match plays on without you, just like a real evening."],
  ["Catch up", "Get the headline, the turning point, the situation right now and what to watch next."],
  ["Make it yours", "Switch to Hinglish or Tamil, try Dost mode, follow your fantasy players and ask a follow-up."],
];

export function Demo() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  return (
    <section className="section demo" id="demo">
      <div className="container demo-grid">
        <div className="demo-copy">
          <Reveal>
            <h2>Step away. Come back. Catch up.</h2>
            <p className="section-lede">
              This is the product, running on real ball-by-ball data from two finals. Try it right here.
            </p>
          </Reveal>
          <ol className="steps">
            {STEPS.map(([title, body], i) => (
              <Reveal key={title} delay={i * 80}>
                <li>
                  <span className="step-num">0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
          <p className="fine">
            Replays the Asian Games final (India vs Pakistan, Oct 2026) and the T20 World Cup final (India vs South
            Africa, 2024).
          </p>
        </div>
        <div className="phone-wrap" ref={ref}>
          <div className="phone">
            <LiveApp active={inView} />
          </div>
        </div>
      </div>
    </section>
  );
}

const STATS = [
  ["90%", "of IPL 2026 watch time was in Indian languages"],
  ["80%", "of fans use a second screen during live sport"],
  ["250M+", "registered users on Dream11"],
  ["~2s", "to the first words of a catch-up"],
];

export function Why() {
  return (
    <section className="section why" id="why">
      <div className="container narrow center">
        <Reveal>
          <h2>Fans don't watch every ball.</h2>
          <p className="section-lede">
            Matches run into office hours, commutes and dinner. A scoreboard gives the score, not what changed or why it
            matters.
          </p>
        </Reveal>
      </div>
      <div className="container stats">
        {STATS.map(([n, label], i) => (
          <Reveal key={n} delay={i * 90} className="stat">
            <div className="stat-num">{n}</div>
            <div className="stat-label">{label}</div>
          </Reveal>
        ))}
      </div>
      <p className="container fine center sources">
        Sources: JioStar via exchange4media (Sep 2026), Dream11 via Analytics Insight (Dec 2025) and Business Standard
        (Sep 2025). Latency measured on this prototype.
      </p>
    </section>
  );
}

const FEATURES = [
  {
    Icon: Database,
    title: "Grounded in ball-by-ball data",
    body: "A cricket engine turns every delivery into facts: score state, key moments and the biggest swing.",
  },
  {
    Icon: ShieldCheck,
    title: "Spoiler-safe by design",
    body: "The model only ever sees balls up to now. It can't leak a result it was never given.",
  },
  {
    Icon: Translate,
    title: "Your language, your tone",
    body: "Eight languages and three tones, from a 20-second gist to Dost mode banter.",
  },
  {
    Icon: Lifebuoy,
    title: "Never a blank screen",
    body: "If the AI is slow or down, fans still get a data-only summary instantly.",
  },
];

export function How() {
  const sample = useMemo(() => {
    const tl = TIMELINES[1];
    const from = indexAtOver(tl, 1, 14);
    const to = indexAtOver(tl, 1, 17);
    const { facts } = buildFacts(tl, from, to, { lang: "en", vibe: "quick", team: "India", players: [] });
    return facts
      .split("\n")
      .filter((l) => /^(WHEN THE FAN LEFT|RIGHT NOW|MISSED IN NUMBERS|  South Africa ov|BIGGEST SWING)/.test(l))
      .slice(0, 7)
      .join("\n");
  }, []);

  return (
    <section className="section how" id="how">
      <div className="container narrow center">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2>Facts first. Then the story.</h2>
        </Reveal>
      </div>
      <div className="container how-grid">
        <div className="how-col">
          {FEATURES.slice(0, 2).map((f, i) => (
            <Reveal key={f.title} delay={i * 90} className="feature left">
              <f.Icon size={20} weight="light" aria-hidden />
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="facts-card">
          <div className="facts-head">
            <span>What the AI sees</span>
            <span className="dim">T20 World Cup final, overs 15 to 17</span>
          </div>
          <pre>{sample}</pre>
          <div className="facts-foot">Gemini writes the recap from this sheet alone, then it streams to the fan.</div>
        </Reveal>
        <div className="how-col">
          {FEATURES.slice(2).map((f, i) => (
            <Reveal key={f.title} delay={i * 90 + 180} className="feature right">
              <f.Icon size={20} weight="light" aria-hidden />
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const LANG_NAMES = ["हिंदी", "தமிழ்", "తెలుగు", "বাংলা", "मराठी", "ಕನ್ನಡ", "Hinglish", "English"];

const SAMPLES = [
  {
    meta: "Hinglish, Dost mode",
    text: "South Africa ne counter-attack kar diya, match abhi tight hai!",
    note: "T20 World Cup final, early in the chase",
  },
  {
    meta: "Tamil, 20-sec",
    text: "பாகிஸ்தான் விக்கெட்டுகளை வீழ்த்தி இந்தியாவை ரன் வேகத்தில் கட்டுப்படுத்தியது.",
    note: "Asian Games final, overs 11 to 16",
  },
];

export function Languages() {
  return (
    <section className="section langs">
      <div className="container narrow center">
        <Reveal>
          <h2>In the language you watch in.</h2>
          <p className="section-lede">Recaps in eight languages and three tones. Ask follow-ups in any language.</p>
        </Reveal>
      </div>
      <div className="marquee" aria-label={`Languages: ${LANG_NAMES.join(", ")}`}>
        <div className="marquee-track" aria-hidden>
          {[...LANG_NAMES, ...LANG_NAMES].map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
      <div className="container samples">
        {SAMPLES.map((s, i) => (
          <Reveal key={s.meta} delay={i * 90} className="sample">
            <div className="sample-meta">{s.meta}</div>
            <p className="sample-text">{s.text}</p>
            <div className="sample-note">Real output from this prototype. {s.note}.</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <a href="#top" className="brand">
            <Mark size={22} />
            <span>Catch Me Up</span>
          </a>
          <p>
            An AI catch-up for fans who step away from live cricket. A prototype built for the Dream11 Forward Deployed
            Engineer internship.
          </p>
          <a href="#demo" className="pill primary sm">
            {CTA} <ArrowRight size={14} aria-hidden />
          </a>
        </div>
        <div className="footer-col">
          <div className="footer-head">Product</div>
          <a href="#demo">Demo</a>
          <a href="#why">Why</a>
          <a href="#how">How it works</a>
        </div>
        <div className="footer-col">
          <div className="footer-head">Credits</div>
          <a href="https://cricsheet.org" target="_blank" rel="noreferrer">
            Match data: Cricsheet <ArrowUpRight size={12} aria-hidden />
          </a>
          <a href="https://ai.google.dev" target="_blank" rel="noreferrer">
            AI: Google Gemini <ArrowUpRight size={12} aria-hidden />
          </a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>Independent prototype. Not affiliated with or endorsed by Dream11.</span>
        <span>Data under ODC-BY</span>
      </div>
    </footer>
  );
}
