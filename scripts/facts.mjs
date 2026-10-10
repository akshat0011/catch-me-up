// Prints the exact fact sheet the AI receives for a catch-up window.
// Usage: node scripts/facts.mjs <matchId> <inn> <fromOver> <toOver> [team]
import { createServer } from "vite";

const [matchId = "asiad-2026-final", inn = "0", fromOver = "10", toOver = "16", team = "India"] = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { getMatch } = await server.ssrLoadModule("/shared/matches.ts");
  const { buildTimeline, indexAtOver } = await server.ssrLoadModule("/shared/engine.ts");
  const { buildFacts } = await server.ssrLoadModule("/shared/context.ts");
  const tl = buildTimeline(getMatch(matchId));
  const from = indexAtOver(tl, +inn, +fromOver);
  const to = indexAtOver(tl, +inn, +toOver);
  const { facts } = buildFacts(tl, from, to, { lang: "en", vibe: "quick", team, players: [6] });
  console.log(facts);
} finally {
  await server.close();
}
