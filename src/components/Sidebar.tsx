import { useEffect, useMemo, useState } from "react";
import {
  catalog,
  sectionById,
  sectionsByGroup,
} from "../lib/catalog";
import { ChevronIcon, CloseIcon, SearchIcon } from "./Icons";
import { Link, useRouter } from "../router";
import { ProficiencyTag } from "./Proficiency";
import { useProficiency } from "../context/ProficiencyContext";
import { codexCommit, codexDraft, type CodexProposal } from "../lib/practice";
import {
  fetchStudyPlans,
  planProgress,
  type StudyPlan,
  type StudyPlanStatus,
} from "../lib/studyPlans";

interface SidebarProps {
  mobileOpen: boolean;
  closeMobile: () => void;
  openSearch: () => void;
}

const studyPlanStatusLabel: Record<StudyPlanStatus, string> = {
  active: "进行中",
  paused: "暂停",
  completed: "完成",
};

function getActiveSectionId(pathname: string) {
  const match = pathname.match(/^\/section\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default function Sidebar({
  mobileOpen,
  closeMobile,
  openSearch,
}: SidebarProps) {
  const { pathname } = useRouter();
  const { ratedCount, getScore } = useProficiency();
  const activeSectionId = getActiveSectionId(pathname);
  const activeGroupId = activeSectionId
    ? sectionById.get(activeSectionId)?.groupId
    : undefined;
  const initialOpenGroups = useMemo(
    () =>
      new Set(
        [catalog.groups[0]?.id, activeGroupId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    [activeGroupId],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpenGroups);
  const [codexInput, setCodexInput] = useState("");
  const [codexBusy, setCodexBusy] = useState(false);
  const [codexMsg, setCodexMsg] = useState("");
  const [codexProposal, setCodexProposal] = useState<CodexProposal | null>(null);
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>([]);

  useEffect(() => {
    fetchStudyPlans().then(setStudyPlans).catch(() => {});
  }, [pathname]);

  async function onCodexAsk() {
    if (!codexInput.trim() || codexBusy) return;
    setCodexBusy(true);
    setCodexMsg("Codex 阅读源码并撰写中，可能需要几分钟…");
    setCodexProposal(null);
    try {
      const { proposal } = await codexDraft(codexInput.trim());
      setCodexProposal(proposal);
      setCodexMsg("");
    } catch (e) {
      setCodexMsg(e instanceof Error ? e.message : "Codex 调用失败");
    } finally {
      setCodexBusy(false);
    }
  }

  function progressOf(sections: { id: string }[]) {
    if (!sections.length) return 0;
    const total = sections.reduce((sum, s) => sum + (getScore(s.id) || 0), 0);
    return total / (sections.length * 10);
  }

  async function onCodexConfirm() {
    if (!codexProposal || codexBusy) return;
    setCodexBusy(true);
    setCodexMsg("写入中…");
    try {
      await codexCommit(codexProposal);
      setCodexMsg("已添加，正在刷新…");
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setCodexMsg(e instanceof Error ? e.message : "写入失败");
    } finally {
      setCodexBusy(false);
    }
  }

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((current) => new Set(current).add(activeGroupId));
  }, [activeGroupId]);

  function toggleGroup(groupId: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <>
      <div
        className={`sidebar-scrim ${mobileOpen ? "is-visible" : ""}`}
        onClick={closeMobile}
        aria-hidden="true"
      />
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar__mast">
          <Link to="/" className="brand" onClick={closeMobile}>
            <span className="brand__mark">A/S</span>
            <span>
              <strong>Agent Systems</strong>
              <small>Field Guide</small>
            </span>
          </Link>
          <button
            type="button"
            className="icon-button sidebar__close"
            onClick={closeMobile}
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>

        <button type="button" className="search-trigger" onClick={openSearch}>
          <SearchIcon />
          <span>Search the field guide</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="sidebar__meta">
          <span>{catalog.sections.length} field notes</span>
          <span>{ratedCount} rated</span>
        </div>

        <div className="overall-progress" title="复习进度：熟练度总分 / 满分">
          <div className="overall-progress__head">
            <span>复习进度</span>
            <b>{Math.round(progressOf(catalog.sections) * 100)}%</b>
          </div>
          <div className="overall-progress__track">
            <i style={{ width: `${progressOf(catalog.sections) * 100}%` }} />
          </div>
        </div>

        <nav className="topic-nav" aria-label="Research tracks">
          {catalog.groups.map((group, groupIndex) => {
            const sections = sectionsByGroup.get(group.id) || [];
            const isStudyPlanGroup = group.id === "studyPlanTocGroup";
            const visibleSections = isStudyPlanGroup
              ? sections.filter((section) => section.id !== "study-plan-week-template")
              : sections;
            const isOpen = openGroups.has(group.id);
            const hasActive = activeGroupId === group.id;
            const progress = isStudyPlanGroup
              ? studyPlans.length
                ? studyPlans.reduce((sum, plan) => sum + planProgress(plan), 0) /
                  studyPlans.length
                : 0
              : progressOf(sections);
            const itemCount = visibleSections.length + (isStudyPlanGroup ? studyPlans.length : 0);
            return (
              <section
                className={`topic-group ${hasActive ? "has-active" : ""}`}
                key={group.id}
              >
                <button
                  type="button"
                  className="topic-group__toggle"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span className="topic-group__number">
                    {String(groupIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="topic-group__title">{group.title}</span>
                  <span className="topic-group__count">{itemCount}</span>
                  <ChevronIcon className={isOpen ? "is-rotated" : ""} />
                </button>
                <div
                  className="topic-group__progress"
                  title={`本组复习进度 ${Math.round(progress * 100)}%`}
                >
                  <i
                    className={progress >= 0.9 ? "is-done" : ""}
                    style={{ width: `${progress * 100}%` }}
                  />
                  <em>{Math.round(progress * 100)}%</em>
                </div>
                {isOpen ? (
                  <div className="topic-group__links">
                    {visibleSections.map((section) => (
                      <Link
                        key={section.id}
                        to={`/section/${section.id}`}
                        className={`topic-link ${activeSectionId === section.id ? "is-active" : ""}`}
                        onClick={closeMobile}
                      >
                        <span>{String(section.order).padStart(2, "0")}</span>
                        <span>{section.menuTitle}</span>
                        <ProficiencyTag sectionId={section.id} compact />
                      </Link>
                    ))}
                    {isStudyPlanGroup ? (
                      <>
                        <Link
                          to="/plans"
                          className={`topic-link topic-link--plan ${pathname === "/plans" ? "is-active" : ""}`}
                          onClick={closeMobile}
                        >
                          <span>OPS</span>
                          <span>学习计划工作台</span>
                          <b>{studyPlans.length}</b>
                        </Link>
                        {studyPlans.map((plan, planIndex) => (
                          <Link
                            key={plan.id}
                            to={`/plans/${plan.id}`}
                            className={`topic-link topic-link--plan ${pathname === `/plans/${plan.id}` ? "is-active" : ""}`}
                            onClick={closeMobile}
                          >
                            <span>{String(planIndex + 1).padStart(2, "0")}</span>
                            <span>{plan.title}</span>
                            <b data-status={plan.status}>
                              {studyPlanStatusLabel[plan.status]}
                            </b>
                          </Link>
                        ))}
                        <Link
                          to="/plans/new"
                          className="topic-link topic-link--plan-new"
                          onClick={closeMobile}
                        >
                          <span>＋</span>
                          <span>新建学习计划</span>
                        </Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>

        <div className="codex-ask">
          <div className="codex-ask__row">
            <input
              className="codex-ask__input"
              placeholder="让 Codex 读源码写问答…"
              value={codexInput}
              onChange={(e) => setCodexInput(e.target.value)}
              disabled={codexBusy}
            />
            <button
              type="button"
              className="codex-ask__send"
              onClick={onCodexAsk}
              disabled={codexBusy || !codexInput.trim()}
              aria-label="提交给 Codex"
            >
              {codexBusy ? "…" : "➤"}
            </button>
          </div>
          {codexMsg ? <p className="codex-ask__msg">{codexMsg}</p> : null}
          {codexProposal ? (
            <div className="codex-proposal">
              <p className="codex-proposal__title">{codexProposal.title}</p>
              <p className="codex-proposal__group">
                放入分组：
                {codexProposal.groupId
                  ? `已有分组 #${codexProposal.groupId}`
                  : `新建「${codexProposal.groupTitle || "Codex 源码问答"}」`}
              </p>
              {codexProposal.summary ? (
                <p className="codex-proposal__summary">{codexProposal.summary}</p>
              ) : null}
              <div className="codex-proposal__actions">
                <button
                  type="button"
                  className="codex-proposal__ok"
                  onClick={onCodexConfirm}
                  disabled={codexBusy}
                >
                  确认添加
                </button>
                <button
                  type="button"
                  className="codex-proposal__cancel"
                  onClick={() => setCodexProposal(null)}
                  disabled={codexBusy}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sidebar__footer">
          <span>Compiled from source code</span>
          <span>and primary documentation.</span>
        </div>
      </aside>
    </>
  );
}
