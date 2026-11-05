import { useEffect, useState, type FormEvent } from "react";
import { ArrowIcon } from "../components/Icons";
import { Link } from "../router";
import {
  createClientId,
  createStudyPlan,
  deleteStudyPlan,
  fetchStudyPlan,
  planProgress,
  updateStudyPlan,
  type StudyPlan,
  type StudyPlanChecklistItem,
  type StudyPlanInput,
  type StudyPlanStatus,
} from "../lib/studyPlans";

interface StudyPlanPageProps {
  planId?: string;
  editing?: boolean;
  creating?: boolean;
}

const statusLabel: Record<StudyPlanStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};

const blankPlan: StudyPlanInput = {
  title: "",
  summary: "",
  goal: "",
  checklist: [],
  acceptance: "",
  deadline: null,
  status: "active",
};

function toInput(plan: StudyPlan): StudyPlanInput {
  return {
    title: plan.title,
    summary: plan.summary,
    goal: plan.goal,
    checklist: plan.checklist,
    acceptance: plan.acceptance,
    deadline: plan.deadline,
    status: plan.status,
  };
}

function newChecklistItem(): StudyPlanChecklistItem {
  return { id: createClientId(), text: "", done: false };
}

export default function StudyPlanPage({
  planId,
  editing = false,
  creating = false,
}: StudyPlanPageProps) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [draft, setDraft] = useState<StudyPlanInput>(blankPlan);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    if (creating) {
      document.title = "新建学习计划 · Agent Systems Field Guide";
      setDraft({ ...blankPlan, checklist: [newChecklistItem()] });
      setLoading(false);
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
        setDraft(toInput(loaded));
        document.title = `${loaded.title} · Agent Systems Field Guide`;
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "加载学习计划失败"),
      )
      .finally(() => setLoading(false));
  }, [creating, planId]);

  function updateDraft<Key extends keyof StudyPlanInput>(
    key: Key,
    value: StudyPlanInput[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateChecklistItem(
    itemId: string,
    updates: Partial<StudyPlanChecklistItem>,
  ) {
    updateDraft(
      "checklist",
      draft.checklist.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item,
      ),
    );
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...draft,
        checklist: draft.checklist.filter((item) => item.text.trim()),
      };
      const saved =
        creating || !planId
          ? await createStudyPlan(payload)
          : await updateStudyPlan(planId, payload);
      window.location.assign(`/plans/${saved.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      setSaving(false);
    }
  }

  async function toggleChecklist(item: StudyPlanChecklistItem) {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const updated = await updateStudyPlan(plan.id, {
        ...toInput(plan),
        checklist: plan.checklist.map((entry) =>
          entry.id === item.id ? { ...entry, done: !entry.done } : entry,
        ),
      });
      setPlan(updated);
      setDraft(toInput(updated));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新清单失败");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: StudyPlanStatus) {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const updated = await updateStudyPlan(plan.id, {
        ...toInput(plan),
        status,
      });
      setPlan(updated);
      setDraft(toInput(updated));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新状态失败");
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
        正在从 SQLite 读取计划…
      </div>
    );
  }

  if (error && !plan && !creating) {
    return (
      <div className="empty-state-page">
        <p className="kicker">PLAN NOT FOUND</p>
        <h1>{error}</h1>
        <Link to="/plans" className="primary-action">
          返回学习计划
          <ArrowIcon />
        </Link>
      </div>
    );
  }

  if (creating || editing) {
    return (
      <div className="plan-editor-page">
        <header className="plan-editor-header">
          <div>
            <p className="kicker">
              {creating ? "NEW OPERATION FILE" : "EDIT OPERATION FILE"}
            </p>
            <h1>{creating ? "新建学习计划" : "编辑学习计划"}</h1>
            <p>标题、目标和验收标准会作为 SQLite 数据保存并进入 Git 仓库。</p>
          </div>
          <Link to={plan ? `/plans/${plan.id}` : "/plans"} className="plan-back">
            取消
          </Link>
        </header>

        <form className="plan-editor" onSubmit={onSave}>
          <label className="plan-field plan-field--wide">
            <span>计划标题 *</span>
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder="例如：两周补齐 RAG 系统设计"
            />
          </label>

          <label className="plan-field plan-field--wide">
            <span>一句话摘要</span>
            <textarea
              rows={2}
              maxLength={500}
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              placeholder="这条计划最终要解决什么问题？"
            />
          </label>

          <label className="plan-field plan-field--wide">
            <span>目标与验收边界</span>
            <textarea
              rows={4}
              value={draft.goal}
              onChange={(event) => updateDraft("goal", event.target.value)}
              placeholder="写到什么程度算完成？尽量用可验证的结果描述。"
            />
          </label>

          <label className="plan-field">
            <span>截止日期</span>
            <input
              type="date"
              value={draft.deadline || ""}
              onChange={(event) =>
                updateDraft("deadline", event.target.value || null)
              }
            />
          </label>

          <label className="plan-field">
            <span>状态</span>
            <select
              value={draft.status}
              onChange={(event) =>
                updateDraft("status", event.target.value as StudyPlanStatus)
              }
            >
              <option value="active">进行中</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
            </select>
          </label>

          <fieldset className="plan-checklist-editor">
            <legend>执行清单</legend>
            {draft.checklist.map((item, index) => (
              <div className="plan-checklist-editor__row" key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  value={item.text}
                  onChange={(event) =>
                    updateChecklistItem(item.id, { text: event.target.value })
                  }
                  placeholder="写一个可以明确勾掉的行动"
                />
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) =>
                      updateChecklistItem(item.id, { done: event.target.checked })
                    }
                  />
                  完成
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft(
                      "checklist",
                      draft.checklist.filter((entry) => entry.id !== item.id),
                    )
                  }
                  aria-label={`删除第 ${index + 1} 项`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="plan-checklist-editor__add"
              onClick={() =>
                updateDraft("checklist", [...draft.checklist, newChecklistItem()])
              }
            >
              ＋ 增加清单项
            </button>
          </fieldset>

          <label className="plan-field plan-field--wide">
            <span>达标的客观证据</span>
            <textarea
              rows={4}
              value={draft.acceptance}
              onChange={(event) => updateDraft("acceptance", event.target.value)}
              placeholder="例如：能脱稿讲清链路；完成两轮模拟面试；题目达到 9 分。"
            />
          </label>

          {error ? <p className="plan-form-error">{error}</p> : null}

          <footer className="plan-editor-actions">
            <Link to={plan ? `/plans/${plan.id}` : "/plans"}>取消</Link>
            <button type="submit" disabled={saving || !draft.title.trim()}>
              {saving ? "保存中…" : creating ? "创建计划" : "保存修改"}
            </button>
          </footer>
        </form>
      </div>
    );
  }

  if (!plan) return null;

  const progress = planProgress(plan);
  const completedItems = plan.checklist.filter((item) => item.done).length;

  return (
    <div className="plan-detail-page" data-status={plan.status}>
      <header className="plan-detail-hero">
        <div className="plan-detail-hero__crumb">
          <Link to="/">Atlas</Link>
          <span>/</span>
          <Link to="/plans">学习计划</Link>
        </div>
        <div className="plan-detail-hero__grid">
          <div>
            <p className="kicker">OPERATION FILE / {statusLabel[plan.status]}</p>
            <h1>{plan.title}</h1>
            <p>{plan.summary || "这条计划暂时没有摘要。"}</p>
            <div className="plan-detail-actions">
              <Link to={`/plans/${plan.id}/edit`}>编辑计划</Link>
              <button type="button" onClick={onDelete} disabled={saving}>
                删除
              </button>
            </div>
          </div>
          <aside className="plan-status-board">
            <span>COMPLETION</span>
            <strong>{Math.round(progress * 100)}%</strong>
            <div>
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <small>
              {completedItems}/{plan.checklist.length} CHECKLIST
            </small>
          </aside>
        </div>
      </header>

      {error ? <p className="plan-form-error">{error}</p> : null}

      <div className="plan-detail-layout">
        <main className="plan-detail-main">
          <section className="plan-section-card">
            <p className="kicker">OBJECTIVE</p>
            <h2>目标</h2>
            <p>{plan.goal || "还没有填写目标。"}</p>
          </section>

          <section className="plan-section-card">
            <div className="plan-section-card__heading">
              <div>
                <p className="kicker">EXECUTION CHECKLIST</p>
                <h2>执行清单</h2>
              </div>
              <span>{completedItems}/{plan.checklist.length}</span>
            </div>
            {plan.checklist.length ? (
              <ul className="plan-checklist">
                {plan.checklist.map((item, index) => (
                  <li key={item.id} data-done={item.done}>
                    <button
                      type="button"
                      onClick={() => toggleChecklist(item)}
                      disabled={saving}
                      aria-pressed={item.done}
                    >
                      <span>{item.done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                      <strong>{item.text}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="plan-muted">还没有清单项，点击“编辑计划”添加。</p>
            )}
          </section>

          <section className="plan-section-card">
            <p className="kicker">ACCEPTANCE EVIDENCE</p>
            <h2>验收标准</h2>
            <p>{plan.acceptance || "还没有填写验收标准。"}</p>
          </section>
        </main>

        <aside className="plan-detail-aside">
          <div>
            <span>STATUS</span>
            <strong>{statusLabel[plan.status]}</strong>
          </div>
          <div>
            <span>DEADLINE</span>
            <strong>{plan.deadline || "未设置"}</strong>
          </div>
          <div>
            <span>UPDATED</span>
            <strong>{plan.updatedAt.slice(0, 10)}</strong>
          </div>
          <div className="plan-status-switch">
            {(["active", "paused", "completed"] as StudyPlanStatus[]).map(
              (status) => (
                <button
                  type="button"
                  key={status}
                  aria-pressed={plan.status === status}
                  onClick={() => changeStatus(status)}
                  disabled={saving}
                >
                  {statusLabel[status]}
                </button>
              ),
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
