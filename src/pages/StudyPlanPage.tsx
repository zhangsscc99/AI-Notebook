import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowIcon } from "../components/Icons";
import { Link } from "../router";
import {
  createStudyPlan,
  deleteStudyPlan,
  fetchStudyPlan,
  updateStudyPlan,
  type StudyPlan,
} from "../lib/studyPlans";

interface StudyPlanPageProps {
  planId?: string;
  editing?: boolean;
  creating?: boolean;
}

export default function StudyPlanPage({
  planId,
  editing = false,
  creating = false,
}: StudyPlanPageProps) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const creationStarted = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);

    if (creating) {
      if (creationStarted.current) return;
      creationStarted.current = true;
      createStudyPlan({
        title: "未命名学习计划",
        body: "",
        rating: null,
      })
        .then((created) => {
          window.location.replace(`/plans/${created.id}/edit`);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "创建计划失败");
          setLoading(false);
        });
      return;
    }

    if (!planId) {
      setError("缺少学习计划 ID");
      setLoading(false);
      return;
    }

    fetchStudyPlan(planId)
      .then((loaded) => {
        setPlan(loaded);
        setTitle(loaded.title);
        setBody(loaded.body);
        document.title = `${loaded.title} · Agent Systems Field Guide`;
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "加载学习计划失败"),
      )
      .finally(() => setLoading(false));
  }, [creating, planId]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateStudyPlan(plan.id, {
        title: title.trim() || "未命名学习计划",
        body,
        rating: plan.rating,
      });
      setPlan(updated);
      setTitle(updated.title);
      setBody(updated.body);
      window.location.assign(`/plans/${updated.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      setSaving(false);
    }
  }

  async function ratePlan(rating: number) {
    if (!plan || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateStudyPlan(plan.id, {
        title: plan.title,
        body: plan.body,
        rating,
      });
      setPlan(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评分失败");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (
      !plan ||
      !window.confirm(`确定删除「${plan.title}」？此操作会同步修改 SQLite 数据库。`)
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteStudyPlan(plan.id);
      window.location.assign("/plans");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="plan-state-page" role="status">
        {creating ? "正在创建空白计划页…" : "正在读取计划…"}
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="empty-state-page">
        <p className="kicker">PLAN ERROR</p>
        <h1>{error}</h1>
        <Link to="/plans" className="primary-action">
          返回学习计划
          <ArrowIcon />
        </Link>
      </div>
    );
  }

  if (!plan) return null;

  if (editing) {
    return (
      <div className="plan-editor-page plan-editor-page--simple">
        <header className="plan-editor-header">
          <div>
            <p className="kicker">EDIT PLAN PAGE</p>
            <h1>{plan.title}</h1>
          </div>
          <Link to={`/plans/${plan.id}`} className="plan-back">
            取消
          </Link>
        </header>

        <form className="plan-simple-editor" onSubmit={onSave}>
          <label>
            <span>页面标题</span>
            <input
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="未命名学习计划"
            />
          </label>

          <label>
            <span>计划正文</span>
            <textarea
              value={body}
              rows={22}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"直接写你的计划，例如：\n\n本周目标\n完成 RAG 系统设计复习。\n\n每天安排\n1. 阅读笔记\n2. 做面试题\n\n完成标准\n能脱稿讲清楚检索与重排链路。"}
            />
          </label>

          {error ? <p className="plan-form-error">{error}</p> : null}

          <footer className="plan-editor-actions">
            <Link to={`/plans/${plan.id}`}>取消</Link>
            <button type="submit" disabled={saving}>
              {saving ? "保存中…" : "保存页面"}
            </button>
          </footer>
        </form>
      </div>
    );
  }

  return (
    <div className="plan-detail-page">
      <header className="plan-detail-hero plan-detail-hero--simple">
        <div className="plan-detail-hero__crumb">
          <Link to="/">Atlas</Link>
          <span>/</span>
          <Link to="/plans">学习计划</Link>
        </div>
        <div className="plan-detail-hero__grid">
          <div>
            <p className="kicker">
              STUDY PLAN / {plan.rating ? `${plan.rating} OF 10` : "UNRATED"}
            </p>
            <h1>{plan.title}</h1>
            <div className="plan-detail-actions">
              <Link to={`/plans/${plan.id}/edit`}>编辑页面</Link>
              <button type="button" onClick={onDelete} disabled={saving}>
                删除
              </button>
            </div>
          </div>
          <aside className="plan-status-board plan-rating-board">
            <span>PLAN RATING</span>
            <strong>{plan.rating ? `${plan.rating}/10` : "—"}</strong>
            <small>更新于 {plan.updatedAt.slice(0, 10)}</small>
          </aside>
        </div>
      </header>

      {error ? <p className="plan-form-error">{error}</p> : null}

      <main className="plan-simple-page">
        {plan.body ? (
          <div className="plan-page-body">{plan.body}</div>
        ) : (
          <div className="plan-page-empty">
            <p>这个页面还是空的。</p>
            <Link to={`/plans/${plan.id}/edit`}>开始编辑</Link>
          </div>
        )}

        <aside className="plan-rating-picker">
          <span>给这条计划评分</span>
          <div className="plan-rating-scale" role="group" aria-label="计划评分">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => (
              <button
                type="button"
                key={rating}
                aria-pressed={plan.rating === rating}
                onClick={() => ratePlan(rating)}
                disabled={saving}
              >
                {rating}
              </button>
            ))}
          </div>
          <p>{plan.rating ? `当前评分 ${plan.rating}/10` : "还没有评分"}</p>
        </aside>
      </main>
    </div>
  );
}
