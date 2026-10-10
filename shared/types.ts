// Compact ball-by-ball format, derived from Cricsheet (cricsheet.org, ODC-BY).
// [overIndex, batter, bowler, nonStriker, runsOffBat, extras, extraType, wicket?]
export type RawWicket = [kind: string, playerOut: number, fielders: string];
export type RawDelivery =
  | [number, number, number, number, number, number, string]
  | [number, number, number, number, number, number, string, RawWicket];

export interface RawMatch {
  id: string;
  event: string;
  stage: string | null;
  date: string;
  venue: string;
  city: string | null;
  teams: [string, string];
  toss: { winner: string; decision: string };
  outcome: { winner?: string; by?: { runs?: number; wickets?: number } };
  overs: number;
  pom: string[] | null;
  names: string[];
  squads: Record<string, number[]>;
  innings: { team: string; target: { overs: number; runs: number } | null; d: RawDelivery[] }[];
}

export interface Ball {
  i: number; // global index across both innings
  inn: number;
  over: number; // 0-based over index
  label: string; // "14.3"
  batter: number;
  bowler: number;
  nonStriker: number;
  runsBat: number;
  extras: number;
  extraType: string;
  total: number;
  legal: boolean;
  wicket?: { kind: string; out: number; fielders: string };
  score: number; // innings score after this ball
  wkts: number;
  legalBalls: number; // legal balls bowled in the innings after this ball
}

export interface BatterLine {
  id: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out?: string; // dismissal text
}

export interface BowlerLine {
  id: number;
  balls: number;
  runs: number;
  wkts: number;
  dots: number;
}

export interface MatchState {
  k: number; // index of the last ball bowled (-1 = not started)
  inn: number;
  batting: string;
  bowling: string;
  score: number;
  wkts: number;
  legalBalls: number;
  oversText: string;
  crr: number;
  target: number | null;
  need: number | null;
  ballsLeft: number;
  rrr: number | null;
  phase: string;
  atCrease: (BatterLine & { onStrike: boolean })[];
  bowler: BowlerLine | null;
  partnership: { runs: number; balls: number };
  thisOver: string[];
  firstInnings: { team: string; score: number; wkts: number; oversText: string } | null;
  winChance: Record<string, number>; // team -> 0..100
  inningsOver: boolean;
  matchOver: boolean;
  result: string | null;
}

export interface OverSummary {
  inn: number;
  overNo: number; // 1-based
  bowler: number;
  runs: number;
  wkts: number;
  seq: string[];
  partial: boolean;
  chanceBefore: number; // win chance (focus team) before the over
  chanceAfter: number;
}

export interface KeyMoment {
  i: number;
  label: string;
  inn: number;
  kind: "wicket" | "six" | "four" | "bigover" | "tightover" | "milestone" | "break";
  text: string;
}

export interface WindowSummary {
  from: number;
  to: number;
  balls: number; // legal balls missed
  runs: number;
  wkts: number;
  fours: number;
  sixes: number;
  extras: number;
  focusTeam: string;
  chanceFrom: number;
  chanceTo: number;
  overs: OverSummary[];
  moments: KeyMoment[];
  batting: { team: string; lines: BatterLine[] }[];
  bowling: { team: string; lines: BowlerLine[] }[];
  turning: { overNo: number; inn: number; text: string; delta: number } | null;
  crossedInnings: boolean;
}

export type Lang = "en" | "hinglish" | "hi" | "ta" | "te" | "bn" | "mr" | "kn";
export type Vibe = "quick" | "analyst" | "dost";

export interface Prefs {
  lang: Lang;
  vibe: Vibe;
  team: string; // a team name or "neutral"
  players: number[]; // up to 3 player ids the fan follows
}
