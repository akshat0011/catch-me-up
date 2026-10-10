import { buildFacts } from "../shared/context";
import { askSystem } from "../shared/prompt";
import { json, parseCommon, rateLimited, streamText, type Turn } from "./_lib";

export const config = { runtime: "edge" };

const MAX_Q = 300;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  const parsed = parseCommon(body);
  if (typeof parsed === "string") return json({ error: parsed }, 400);
  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_Q) : "";
  if (!question) return json({ error: "empty question" }, 400);
  if (!process.env.GEMINI_API_KEY) return json({ error: "not_configured" }, 503);
  if (rateLimited(req, "ask", 60)) return json({ error: "rate_limited" }, 429);

  const { tl, from, to, prefs } = parsed;
  const { facts } = buildFacts(tl, from, to, prefs);
  const history: Turn[] = [];
  if (Array.isArray(body.history)) {
    for (const turn of body.history.slice(-4)) {
      if (typeof turn?.q !== "string" || typeof turn?.a !== "string") continue;
      history.push({ role: "user", text: turn.q.slice(0, MAX_Q) });
      history.push({ role: "model", text: turn.a.slice(0, 1200) });
    }
  }
  const turns: Turn[] = history.length
    ? [{ role: "user", text: `${facts}\n\n${history[0].text}` }, ...history.slice(1), { role: "user", text: question }]
    : [{ role: "user", text: `${facts}\n\n${question}` }];
  return streamText(askSystem(prefs.lang), turns, 1024);
}
