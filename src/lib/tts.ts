let currentUtterance: SpeechSynthesisUtterance | null = null;
let listeners = new Set<(playingId: string | null) => void>();

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

export function subscribeTts(fn: (playingId: string | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(id: string | null) {
  listeners.forEach((fn) => fn(id));
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return (
    voices.find((v) => /zh[-_]CN/i.test(v.lang) && /ting|mei|xiaoxiao|hui|ya/i.test(v.name)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null
  );
}

export function speak(id: string, text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.onend = () => {
    if (currentUtterance === utterance) {
      currentUtterance = null;
      notify(null);
    }
  };
  utterance.onerror = () => {
    if (currentUtterance === utterance) {
      currentUtterance = null;
      notify(null);
    }
  };
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  notify(id);
}

export function stopSpeak() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
  notify(null);
}
