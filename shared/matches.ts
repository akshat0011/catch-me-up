import type { RawMatch } from "./types";
import asiad from "./matches/asiad-2026-final.json";
import wc from "./matches/t20wc-2024-final.json";

export interface TeamStyle {
  code: string;
  flag: string;
  color: string;
}

export interface MatchMeta {
  id: string;
  data: RawMatch;
  title: string;
  subtitle: string;
  stakes: string; // one line of context the AI and the fan both get
  teams: Record<string, TeamStyle>;
  fullNames: Record<string, string>;
  shortNames: Record<string, string>;
  demoStart: { inn: number; over: number }; // where the "live" replay starts
}

const TEAMS: Record<string, TeamStyle> = {
  India: { code: "IND", flag: "🇮🇳", color: "#3B82F6" },
  Pakistan: { code: "PAK", flag: "🇵🇰", color: "#22C55E" },
  "South Africa": { code: "SA", flag: "🇿🇦", color: "#F5B700" },
};

// Cricsheet uses scorecard initials; fans don't.
const FULL: Record<string, string> = {
  "V Suryavanshi": "Vaibhav Suryavanshi",
  "SV Samson": "Sanju Samson",
  "SS Iyer": "Shreyas Iyer",
  "S Dube": "Shivam Dube",
  "AR Patel": "Axar Patel",
  "JJ Bumrah": "Jasprit Bumrah",
  "RG Sharma": "Rohit Sharma",
  "V Kohli": "Virat Kohli",
  "RR Pant": "Rishabh Pant",
  "SA Yadav": "Suryakumar Yadav",
  "HH Pandya": "Hardik Pandya",
  "RA Jadeja": "Ravindra Jadeja",
  "RR Hendricks": "Reeza Hendricks",
  "Q de Kock": "Quinton de Kock",
  "AK Markram": "Aiden Markram",
  "T Stubbs": "Tristan Stubbs",
  "H Klaasen": "Heinrich Klaasen",
  "DA Miller": "David Miller",
  "M Jansen": "Marco Jansen",
  "KA Maharaj": "Keshav Maharaj",
  "K Rabada": "Kagiso Rabada",
  "A Nortje": "Anrich Nortje",
  "T Shamsi": "Tabraiz Shamsi",
};

// Short names where the surname alone is ambiguous or not what fans say.
const SHORT: Record<string, string> = {
  "Suryakumar Yadav": "Suryakumar",
  "Kuldeep Yadav": "Kuldeep",
  "Arshdeep Singh": "Arshdeep",
  "Abhishek Sharma": "Abhishek",
  "Rohit Sharma": "Rohit",
  "Ishan Kishan": "Ishan",
  "Tilak Varma": "Tilak",
  "Washington Sundar": "Sundar",
  "Ravi Bishnoi": "Bishnoi",
  "Sahibzada Farhan": "Farhan",
  "Maaz Sadaqat": "Sadaqat",
  "Usman Khan": "Usman",
  "Hassan Nawaz": "Nawaz",
  "Saim Ayub": "Saim",
  "Abdul Samad": "Samad",
  "Saad Masood": "Masood",
  "Arafat Minhas": "Minhas",
  "Ahmed Daniyal": "Daniyal",
  "Abrar Ahmed": "Abrar",
  "Sufiyan Muqeem": "Muqeem",
  "Quinton de Kock": "de Kock",
};

function meta(
  data: RawMatch,
  m: Pick<MatchMeta, "title" | "subtitle" | "stakes" | "demoStart">,
): MatchMeta {
  const fullNames: Record<string, string> = {};
  const shortNames: Record<string, string> = {};
  for (const n of data.names) {
    const full = FULL[n] ?? n;
    fullNames[n] = full;
    shortNames[n] = SHORT[full] ?? full.split(" ").slice(-1)[0];
  }
  return {
    id: data.id,
    data,
    teams: Object.fromEntries(data.teams.map((t) => [t, TEAMS[t]])),
    fullNames,
    shortNames,
    ...m,
  };
}

export const MATCHES: MatchMeta[] = [
  meta(asiad as unknown as RawMatch, {
    title: "India vs Pakistan",
    subtitle: "Asian Games · Gold medal match · 3 Oct 2026",
    stakes: "Asian Games men's cricket final (T20) — gold medal on the line, India vs Pakistan.",
    demoStart: { inn: 0, over: 10 },
  }),
  meta(wc as unknown as RawMatch, {
    title: "India vs South Africa",
    subtitle: "T20 World Cup · Final · 29 Jun 2024",
    stakes: "ICC Men's T20 World Cup final — India hunting a first ICC trophy in 11 years, South Africa in their first-ever men's World Cup final.",
    demoStart: { inn: 1, over: 12 },
  }),
];

export function getMatch(id: string): MatchMeta | undefined {
  return MATCHES.find((m) => m.id === id);
}
