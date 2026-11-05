import { useEffect, useState } from "react";
import { ArrowIcon } from "../components/Icons";
import { Link } from "../router";
import {
  fetchStudyPlans,
  type StudyPlan,
  type StudyPlanStatus,
} from "../lib/studyPlans";

const statusLabel: Record<StudyPlanStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};

export default function StudyPlansPage() {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "学习计划 · Agent Systems Field Guide";
    window.scrollTo(0, 0);
    fetchStudyPlans()
      .then(setPlans)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "加载学习计划失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="plans-page">
      <header className="plans-hero">
        <div>
          <p className="kicker">FIELD OPERATIONS / STUDY PLAN</p>
          <h1>把目标拆成可以勾掉的证据。</h1>
          <p>
            每一条计划都直接保存在 SQLite。创建、编辑、暂停、完成和删除都会即时写入
            8765 服务的数据文件。
          </p>
        </div>
        <aside className="plans-hero__stamp" aria-hidden="true">
          <span>OPS</span>
          <strong>{String(plans.length).padStart(2, "0")}</strong>
          <small>ACTIVE FILES</small>
        </aside>
      </header>

      <div className="plans-toolbar">
        <div>
          <span>{String(plans.length).padStart(2, "0")} PLANS</span>
          <span>LOCAL SQLITE / GITHUB TRACKED</span>
        </div>
        <Link className="plans-create" to="/plans/new">
          <span>＋</span>
          新建学习计划
        </Link>
      </div>

      {loading ? (
        <div className="plans-loading" role="status">
          正在读取计划数据库…
        </div>
      ) : null}
      {error ? (
        <div className="plans-error" role="alert">
          <strong>读取失败</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {!loading && !error && plans.length === 0 ? (
        <section className="plans-empty">
          <p className="kicker">NO ACTIVE FILES</p>
          <h2>还没有学习计划。</h2>
          <p>从一个小目标开始，清单和验收标准以后还可以继续改。</p>
          <Link className="primary-action" to="/plans/new">
            创建第一条计划
            <ArrowIcon />
          </Link>
        </section>
      ) : null}

      <section className="plans-board" aria-label="学习计划列表">
        {plans.map((plan, index) => {
          return (
            <Link
              className="plan-card"
              data-status={plan.status}
              to={`/plans/${plan.id}`}
              key={plan.id}
            >
              <header>
                <span className="plan-card__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="plan-card__status">{statusLabel[plan.status]}</span>
              </header>
              <h2>{plan.title}</h2>
              <p>{plan.body.trim().slice(0, 220) || "空白计划，打开后开始编辑。"}</p>
              <footer>
                <span>更新 {plan.updatedAt.slice(0, 10)}</span>
                <ArrowIcon />
              </footer>
            </Link>
          );
        })}
      </section>

      <p className="plans-note">
        需要查看旧的静态说明？
        <Link to="/section/study-plan-overview">打开学习计划使用说明</Link>
      </p>
    </div>
  );
}
