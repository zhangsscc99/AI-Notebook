import { useEffect, useState } from "react";
import { speak, stopSpeak, subscribeTts } from "../lib/tts";

export default function SpeakButton({
  id,
  text,
  label = "朗读",
}: {
  id: string;
  text: string;
  label?: string;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => subscribeTts(setPlayingId), []);

  if (!("speechSynthesis" in window)) return null;

  const playing = playingId === id;
  return (
    <button
      type="button"
      className={`speak-btn ${playing ? "is-playing" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) stopSpeak();
        else speak(id, text);
      }}
      aria-label={playing ? "停止朗读" : label}
      title={playing ? "停止" : label}
    >
      {playing ? "◼" : "▶"}
    </button>
  );
}
