import { useId } from "react";
import { useProficiency } from "../context/ProficiencyContext";

interface ProficiencyTagProps {
  sectionId: string;
  compact?: boolean;
}

interface ProficiencyPickerProps {
  sectionId: string;
}

const SCORE_LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

function scoreLabel(score: number | undefined) {
  if (!score) return "未评分";
  if (score <= 2) return "很不熟练";
  if (score <= 4) return "不熟练";
  if (score <= 6) return "一般";
  if (score <= 8) return "较熟练";
  return "很熟练";
}

export function ProficiencyTag({
  sectionId,
  compact = false,
}: ProficiencyTagProps) {
  const { getScore } = useProficiency();
  const score = getScore(sectionId);

  return (
    <span
      className={`proficiency-tag ${compact ? "is-compact" : ""}`}
      data-score={score ?? "unrated"}
      aria-label={
        score
          ? `熟练度 ${score} 分，共 10 分，${scoreLabel(score)}`
          : "尚未评分"
      }
      title={
        score
          ? `熟练度 ${score}/10 · ${scoreLabel(score)}`
          : "尚未评分"
      }
    >
      <strong>{score ?? "–"}</strong>
      {!compact ? <span>{score ? `熟练度 ${score}/10` : "未评分"}</span> : null}
    </span>
  );
}

export function ProficiencyPicker({ sectionId }: ProficiencyPickerProps) {
  const { getScore, setScore, clearScore } = useProficiency();
  const score = getScore(sectionId);
  const labelId = useId();

  return (
    <section className="proficiency-panel" aria-labelledby={labelId}>
      <div className="proficiency-panel__header">
        <div>
          <p className="proficiency-panel__eyebrow">PERSONAL FAMILIARITY</p>
          <h2 id={labelId}>我的熟练度</h2>
        </div>
        <ProficiencyTag sectionId={sectionId} />
      </div>
      <p className="proficiency-panel__help">
        给自己打 1–10 分。颜色越白表示越需要复习，越黑表示越熟练。
      </p>
      <div className="proficiency-scale" role="group" aria-label="选择熟练度">
        {SCORE_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className="proficiency-scale__button"
            data-score={level}
            aria-label={`${level} 分，${scoreLabel(level)}`}
            aria-pressed={score === level}
            title={`${level} 分 · ${scoreLabel(level)}`}
            onClick={() => setScore(sectionId, level)}
          >
            {level}
          </button>
        ))}
      </div>
      <div className="proficiency-panel__legend">
        <span>1 · 不熟练</span>
        <span>5–6 · 一般</span>
        <span>10 · 熟练</span>
        {score ? (
          <button type="button" onClick={() => clearScore(sectionId)}>
            清除评分
          </button>
        ) : null}
      </div>
    </section>
  );
}
