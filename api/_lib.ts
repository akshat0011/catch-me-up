import { buildTimeline, type Timeline } from "../shared/engine.js";
import { getMatch } from "../shared/matches.js";
import { LANGS, VIBES } from "../shared/prompt.js";
import type { Lang, Prefs, Vibe } from "../shared/types.js";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const timelines = new Map<string, Timeline>();

export interface ParsedRequest {
  tl: Timeline;
  from: number;
  to: number;
  prefs: Prefs;
}

export interface Turn {
  role: "user" | "model";
  text: string;
}

/** Validates the shared part of every request. The client only sends ids and indices — the server owns the match data and builds the prompt. */
export function parseCommon(body: any): ParsedRequest | string {
  if (!body || typeof body !== "object") return "bad body";
  const meta = getMatch(String(body.matchId));
  if (!meta) return "unknown match";
  if (!timelines.has(meta.id)) timelines.set(meta.id, buildTimeline(meta));
  const tl = timelines.get(meta.id)!;
  const from = Number(body.from);
  const to = Number(body.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < -1 || to >= tl.balls.length || from >= to) return "bad range";
  const p = body.prefs ?? {};
  const lang = LANGS.some((l) => l.id === p.lang) ? (p.lang as Lang) : "en";
  const vibe = VIBES.some((v) => v.id === p.vibe) ? (p.vibe as Vibe) : "quick";
  const team = tl.meta.data.teams.includes(p.team) ? p.team : "neutral";
  const squad = new Set(Object.values(tl.meta.data.squads).flat());
  const players = Array.isArray(p.players)
    ? [...new Set(p.players.map(Number).filter((n: number) => squad.has(n)))].slice(0, 3) as number[]
    : [];
  return { tl, from, to, prefs: { lang, vibe, team, players } };
}

// Best-effort per-instance limiter; the real cap is the API key's quota.
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, bucket: string, max: number, windowMs = 10 * 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

/**
 * Streams Gemini's text back as a plain-text body (Gemini REST API, SSE mode).
 * If the model is blocked or errors mid-way, appends a sentinel so the client can fall back gracefully.
 */
export function streamText(system: string, turns: Turn[], maxTokens: number): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false;
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
              generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8, thinkingConfig: { thinkingLevel: "minimal" } },
            }),
          },
        );
        if (!res.ok || !res.body) throw new Error(`gemini http ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const chunk = JSON.parse(line.slice(5));
            const cand = chunk.candidates?.[0];
            const text = (cand?.content?.parts ?? [])
              .filter((p: { thought?: boolean }) => !p.thought)
              .map((p: { text?: string }) => p.text ?? "")
              .join("");
            if (text) controller.enqueue(encoder.encode(text));
            if (chunk.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(cand?.finishReason)) {
              failed = true;
            }
          }
        }
      } catch (err) {
        console.error("gemini error", err);
        failed = true;
      } finally {
        if (failed) controller.enqueue(encoder.encode("\n[[ERROR]]"));
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
