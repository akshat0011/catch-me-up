import type { Timeline } from "../../shared/engine";
import type { WindowSummary } from "../../shared/types";

const W = 340;
const H = 168;
const PAD_L = 26;
const PAD_R = 8;
const TOP = 14; // chance panel
const TOP_H = 58;
const BAR_BASE = 146; // runs panel baseline
const BAR_H = 52;

export function Momentum({ tl, w }: { tl: Timeline; w: WindowSummary }) {
  const n = w.overs.length;
  if (!n) return null;
  const slot = (W - PAD_L - PAD_R) / n;
  const barW = Math.max(3, Math.min(22, slot * 0.62));
  const maxRuns = Math.max(18, ...w.overs.map((o) => o.runs));
  const x = (i: number) => PAD_L + slot * i + slot / 2;
  const y = (c: number) => TOP + TOP_H - (c / 100) * TOP_H;
  const focusColor = tl.meta.teams[w.focusTeam]?.color ?? "#fafafa";
  const pts = [`${PAD_L},${y(w.chanceFrom)}`, ...w.overs.map((o, i) => `${x(i)},${y(o.chanceAfter)}`)];
  const area = `${pts.join(" ")} ${x(n - 1)},${TOP + TOP_H} ${PAD_L},${TOP + TOP_H}`;
  const turnIdx = w.turning ? w.overs.findIndex((o) => o.overNo === w.turning!.overNo && o.inn === w.turning!.inn) : -1;
  const breakIdx = w.overs.findIndex((o, i) => i > 0 && o.inn !== w.overs[i - 1].inn);
  const labelEvery = n > 24 ? 4 : n > 12 ? 2 : 1;

  return (
    <figure className="momentum">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${w.focusTeam} win chance went from ${w.chanceFrom}% to ${w.chanceTo}%`}>
        {turnIdx >= 0 && (
          <g>
            <rect x={PAD_L + slot * turnIdx} y={4} width={slot} height={BAR_BASE - 4} rx={4} className="turn-band" />
            <text
              x={turnIdx > n / 2 ? PAD_L + slot * (turnIdx + 1) - 2 : PAD_L + slot * turnIdx + 2}
              y={11}
              textAnchor={turnIdx > n / 2 ? "end" : "start"}
              className="turn-label"
            >
              turning point
            </text>
          </g>
        )}
        <line x1={PAD_L} x2={W - PAD_R} y1={y(50)} y2={y(50)} className="grid dashed" />
        <text x={2} y={y(50) + 3} className="axis">50%</text>
        <text x={2} y={y(100) + 6} className="axis">100</text>
        <polygon points={area} fill={focusColor} opacity={0.14} />
        <polyline points={pts.join(" ")} fill="none" stroke={focusColor} strokeWidth={2.2} strokeLinejoin="round" />
        <circle cx={x(n - 1)} cy={y(w.chanceTo)} r={3.5} fill={focusColor} />

        <line x1={PAD_L} x2={W - PAD_R} y1={BAR_BASE} y2={BAR_BASE} className="grid" />
        <text x={2} y={BAR_BASE - BAR_H + 6} className="axis">{maxRuns}</text>
        <text x={2} y={BAR_BASE} className="axis">runs</text>
        {breakIdx > 0 && (
          <line x1={PAD_L + slot * breakIdx} x2={PAD_L + slot * breakIdx} y1={TOP} y2={BAR_BASE} className="grid dashed" />
        )}
        {w.overs.map((o, i) => {
          const h = Math.max(1.5, (o.runs / maxRuns) * BAR_H);
          const color = tl.meta.teams[tl.meta.data.innings[o.inn].team]?.color ?? "#8A96AB";
          return (
            <g key={`${o.inn}-${o.overNo}`}>
              <rect x={x(i) - barW / 2} y={BAR_BASE - h} width={barW} height={h} rx={2} fill={color} opacity={o.partial ? 0.45 : 0.9} />
              {o.wkts > 0 &&
                Array.from({ length: o.wkts }).map((_, j) => (
                  <circle key={j} cx={x(i)} cy={BAR_BASE - h - 5 - j * 8} r={3.2} className="wkt-dot" />
                ))}
              {i % labelEvery === 0 && (
                <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">
                  {o.overNo}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="muted small">
        <span className="legend-line" style={{ background: focusColor }} /> {w.focusTeam} win chance &nbsp;
        <span className="legend-bar" /> runs per over &nbsp; <span className="legend-dot" /> wicket
      </figcaption>
    </figure>
  );
}
