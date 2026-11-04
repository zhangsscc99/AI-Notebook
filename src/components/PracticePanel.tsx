import { useEffect, useState } from "react";
import {
  askCoach,
  fetchHistory,
  generateQuestion,
  saveAttempt,
  scoreAnswer,
  type PracticeRecord,
} from "../lib/practice";
import type { ContentSection } from "../types";
import SpeakButton from "./SpeakButton";
import { stopSpeak } from "../lib/tts";

interface PracticePanelProps {
  section: ContentSection;
  articleText: string;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function PracticePanel({ section, articleText }: PracticePanelProps) {
  const context = articleText || "";
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [recordId, setRecordId] = useState<string | undefined>();
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ score: number; analysis: string } | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [history, setHistory] = useState<PracticeRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [coachInput, setCoachInput] = useState("");
  const [coachReply, setCoachReply] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachPage, setCoachPage] = useState(0);
  const [status, setStatus] = useState<"idle" | "question" | "scoring">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => stopSpeak();
  }, [section.id]);

  useEffect(() => {
    if (!open) return;
    fetchHistory()
      .then(setHistory)
      .catch(() => {});
  }, [open, result]);

  async function onGenerate() {
    setError("");
    setResult(null);
    setRecordId(undefined);
    setBestScore(null);
    setStatus("question");
    try {
      const { question: q } = await generateQuestion({
        title: section.title,
        groupTitle: section.groupTitle,
        context,
      });
      setQuestion(q);
      setAnswer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setStatus("idle");
    }
  }

  async function onScore() {
    if (!answer.trim() || !question) return;
    setError("");
    setStatus("scoring");
    try {
      const scored = await scoreAnswer({
        question,
        answer: answer.trim(),
        title: section.title,
        context,
      });
      setResult(scored);
      const saved = await saveAttempt({
        id: recordId,
        sectionId: section.id,
        sectionTitle: section.title,
        groupTitle: section.groupTitle,
        question,
        answer: answer.trim(),
        score: scored.score,
        analysis: scored.analysis,
      });
      setRecordId(saved.id);
      setBestScore(saved.bestScore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "打分失败");
    } finally {
      setStatus("idle");
    }
  }

  async function onAskCoach(record: PracticeRecord) {
    if (!coachInput.trim() || coachLoading) return;
    setCoachLoading(true);
    setCoachReply("");
    setError("");
    try {
      const { reply } = await askCoach({
        userQuestion: coachInput.trim(),
        record: { question: record.question, attempts: record.attempts },
        recordId: record.id,
      });
      setCoachReply(reply);
      setCoachInput("");
      const updated = await fetchHistory();
      setHistory(updated);
      setCoachPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "答疑失败");
    } finally {
      setCoachLoading(false);
    }
  }

  function retryRecord(record: PracticeRecord) {
    setQuestion(record.question);
    setRecordId(record.id);
    setBestScore(record.bestScore);
    setAnswer("");
    setResult(null);
    setError("");
    setExpandedId(null);
  }

  const busy = status !== "idle";
  const sectionHistory = history.filter((r) => r.sectionId === section.id);
  const otherHistory = history.filter((r) => r.sectionId !== section.id);
  const orderedHistory = [...sectionHistory, ...otherHistory];
  const pageSize = 3;
  const pageCount = Math.ceil(orderedHistory.length / pageSize);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const pageRecords = orderedHistory.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  return (
    <section className="practice">
      <button
        type="button"
        className="practice__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="practice__toggle-title">面试练习</span>
        <span className="practice__toggle-hint">
          DeepSeek 出题 · 作答打分 · 历史回顾
        </span>
        <span className={`practice__chevron ${open ? "is-open" : ""}`}>▾</span>
      </button>

      {open ? (
        <div className="practice__body">
          <div className="practice__row">
            <button
              type="button"
              className="practice__generate"
              onClick={onGenerate}
              disabled={busy}
            >
              {status === "question" ? "出题中…" : "生成一道面试题"}
            </button>
            {bestScore !== null ? (
              <span className="practice__best">
                本题最佳 <b>{bestScore}</b>/10
              </span>
            ) : null}
          </div>

          {error ? <p className="practice__error">{error}</p> : null}

          {question ? (
            <div className="practice__question">
              <div className="practice__label-row">
                <span className="practice__label">面试官提问</span>
                <SpeakButton
                  id={`q-${recordId || "draft"}`}
                  text={question}
                  label="朗读问题"
                />
              </div>
              <p>{question}</p>
            </div>
          ) : null}

          {question ? (
            <>
              <textarea
                className="practice__answer"
                placeholder="用简短的话回答，像面试现场一样…"
                rows={4}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={busy}
              />
              <div className="practice__row">
                <button
                  type="button"
                  className="practice__submit"
                  onClick={onScore}
                  disabled={busy || !answer.trim()}
                >
                  {status === "scoring"
                    ? "打分中…"
                    : result
                      ? "重新提交打分"
                      : "提交回答"}
                </button>
                {result ? (
                  <span
                    className={`practice__score ${result.score >= 9 ? "is-high" : result.score >= 7 ? "is-mid" : "is-low"}`}
                  >
                    {result.score}<small>/10</small>
                  </span>
                ) : null}
              </div>
            </>
          ) : null}

          {result ? (
            <div className="practice__analysis">
              <div className="practice__label-row">
                <span className="practice__label">面试官解析</span>
                <SpeakButton
                  id={`a-${recordId || "draft"}-${result.score}`}
                  text={result.analysis}
                  label="朗读解析"
                />
              </div>
              <p>{result.analysis}</p>
            </div>
          ) : null}

          {history.length ? (
            <div className="practice__history">
              <div className="practice__history-head">
                历史记录 <span>{history.length} 题</span>
                {pageCount > 1 ? (
                  <span className="practice__pager">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      aria-label="上一页"
                    >
                      ‹
                    </button>
                    <em>
                      {safePage + 1} / {pageCount}
                    </em>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(pageCount - 1, p + 1))
                      }
                      disabled={safePage >= pageCount - 1}
                      aria-label="下一页"
                    >
                      ›
                    </button>
                  </span>
                ) : null}
              </div>
              {pageRecords.map((record) => (
                <div className="practice-record" key={record.id}>
                  <button
                    type="button"
                    className="practice-record__head"
                    onClick={() => {
                      setExpandedId(
                        expandedId === record.id ? null : record.id,
                      );
                      setCoachInput("");
                      setCoachReply("");
                      setCoachPage(0);
                    }}
                  >
                    <span
                      className={`practice__score practice__score--sm ${record.bestScore >= 9 ? "is-high" : record.bestScore >= 7 ? "is-mid" : "is-low"}`}
                    >
                      {record.bestScore}
                    </span>
                    <span className="practice-record__question">
                      {record.question}
                    </span>
                    <span className="practice-record__meta">
                      {record.attempts.length} 次 · {formatTime(record.createdAt)}
                    </span>
                  </button>
                  {expandedId === record.id ? (
                    <div className="practice-record__detail">
                      <div className="practice-record__source">
                        {record.groupTitle} · {record.sectionTitle}
                      </div>
                      {[...record.attempts].reverse().map((attempt, index) => (
                        <div className="practice-attempt" key={index}>
                          <div className="practice-attempt__head">
                            <span className="practice-attempt__no">
                              第 {record.attempts.length - index} 次
                            </span>
                            <span
                              className={`practice__score practice__score--sm ${attempt.score >= 9 ? "is-high" : attempt.score >= 7 ? "is-mid" : "is-low"}`}
                            >
                              {attempt.score}
                            </span>
                            <span className="practice-attempt__time">
                              {formatTime(attempt.at)}
                            </span>
                          </div>
                          <p className="practice-attempt__answer">
                            {attempt.answer}
                          </p>
                          <p className="practice-attempt__analysis">
                            {attempt.analysis}
                            <SpeakButton
                              id={`att-${record.id}-${index}`}
                              text={attempt.analysis}
                              label="朗读解析"
                            />
                          </p>
                        </div>
                      ))}
                      <div className="practice-coach">
                        {(() => {
                          const entries = [...(record.coach || [])].reverse();
                          const pages = Math.ceil(entries.length / 3);
                          const safeCoachPage = Math.min(
                            coachPage,
                            Math.max(0, pages - 1),
                          );
                          const visible = entries.slice(
                            safeCoachPage * 3,
                            safeCoachPage * 3 + 3,
                          );
                          return entries.length ? (
                            <div className="practice-coach__log">
                              {visible.map((entry, index) => (
                                <div
                                  className="practice-coach__entry"
                                  key={index}
                                >
                                  <p className="practice-coach__q">
                                    <b>问</b>
                                    {entry.q}
                                  </p>
                                  <p className="practice-coach__a">
                                    <b>答</b>
                                    <span>{entry.reply}</span>
                                    <SpeakButton
                                      id={`coach-${record.id}-${index}`}
                                      text={entry.reply}
                                      label="朗读回答"
                                    />
                                  </p>
                                </div>
                              ))}
                              {pages > 1 ? (
                                <div className="practice-coach__pager">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCoachPage((p) =>
                                        Math.max(0, p - 1),
                                      )
                                    }
                                    disabled={safeCoachPage === 0}
                                    aria-label="上一页"
                                  >
                                    ‹
                                  </button>
                                  <em>
                                    {safeCoachPage + 1} / {pages}
                                  </em>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCoachPage((p) =>
                                        Math.min(pages - 1, p + 1),
                                      )
                                    }
                                    disabled={safeCoachPage >= pages - 1}
                                    aria-label="下一页"
                                  >
                                    ›
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null;
                        })()}
                        <div className="practice-coach__input-row">
                          <input
                            className="practice-coach__input"
                            placeholder="针对这道题追问答疑…"
                            value={coachInput}
                            onChange={(e) => setCoachInput(e.target.value)}
                            disabled={coachLoading}
                          />
                          <button
                            type="button"
                            className="practice-coach__send"
                            onClick={() => onAskCoach(record)}
                            disabled={coachLoading || !coachInput.trim()}
                          >
                            {coachLoading ? "…" : "问"}
                          </button>
                        </div>
                        {coachReply ? (
                          <p className="practice-coach__reply">
                            {coachReply}
                            <SpeakButton
                              id={`coach-new-${record.id}`}
                              text={coachReply}
                              label="朗读回答"
                            />
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="practice-record__retry"
                        onClick={() => retryRecord(record)}
                      >
                        重新作答这道题
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
