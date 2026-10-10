export type StreamResult = { ok: true; text: string } | { ok: false; error: string; text: string };

/** POSTs JSON and streams the plain-text response, calling onText with the full text so far. */
export async function streamPost(
  url: string,
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  let text = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: `http_${res.status}` }));
      return { ok: false, error: err.error ?? `http_${res.status}`, text };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes("[[ERROR]]")) {
        text = text.replace(/\s*\[\[ERROR\]\]\s*/g, "");
        return { ok: false, error: "model_error", text };
      }
      onText(text);
    }
    return { ok: true, text };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "aborted", text };
    return { ok: false, error: "network", text };
  }
}
