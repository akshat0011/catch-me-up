import type { Timeline } from "../../shared/engine";

export function TeamBadge({ tl, team, size = "md" }: { tl: Timeline; team: string; size?: "sm" | "md" }) {
  const style = tl.meta.teams[team];
  return (
    <span className={`team-badge ${size}`} style={{ "--team": style.color } as React.CSSProperties}>
      {style.code}
    </span>
  );
}

export function BallChip({ s }: { s: string }) {
  const kind =
    s === "W" ? "w" : s === "6" ? "six" : s === "4" ? "four" : s === "•" ? "dot" : /wd|nb|lb|b/.test(s) ? "extra" : "";
  return <span className={`ball ${kind}`}>{s}</span>;
}

export const oversFromBalls = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
