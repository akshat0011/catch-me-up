export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string, lang: string, onEnd: () => void): void {
  if (!canSpeak()) return onEnd();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
  u.lang = lang;
  const base = lang.split("-")[0];
  const voice =
    synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith(base));
  if (voice) u.voice = voice;
  u.rate = 1.05;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
