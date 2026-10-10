import { buildFacts } from "../shared/context.js";
import { recapSystem, styleReminder } from "../shared/prompt.js";
import { json, parseCommon, rateLimited, streamText } from "./_lib.js";

export async function POST(req: Request): Promise<Response> {
  const parsed = parseCommon(await req.json().catch(() => null));
  if (typeof parsed === "string") return json({ error: parsed }, 400);
  if (!process.env.GEMINI_API_KEY) return json({ error: "not_configured" }, 503);
  if (rateLimited(req, "catchup", 30)) return json({ error: "rate_limited" }, 429);

  const { tl, from, to, prefs } = parsed;
  const { facts } = buildFacts(tl, from, to, prefs);
  return streamText(
    recapSystem(prefs.lang, prefs.vibe),
    [{ role: "user", text: `${facts}\n\nCatch me up on what I missed. ${styleReminder(prefs.lang, prefs.vibe)}` }],
    2048,
  );
}
