import type { CSSProperties } from "react";
import { catalog, sectionById, sectionsByGroup } from "../lib/catalog";
import { preloadArticle } from "../lib/articles";
import { ArrowIcon, CommandIcon, SearchIcon } from "../components/Icons";
import { useSearch } from "../context/SearchContext";
import { Link } from "../router";

const featuredIds = [
  "claude-workflow-agent-loop",
  "deepseek-harness-overview",
  "claude-tools-scale-routing-token-cost",
  "openclaw-gateway-overview",
];

export default function HomePage() {
  const { openSearch } = useSearch();
  const featured = featuredIds
    .map((id) => sectionById.get(id))
    .filter((section) => section !== undefined);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="kicker">FIELD NOTES / AGENT ENGINEERING / 2026</p>
          <h1>
            Agent systems,
            <br />
            <em>read closely.</em>
          </h1>
          <p className="home-hero__intro">
            从真实源码、论文和运行系统出发，拆解 Agent 主循环、工具调用、记忆、
            多智能体编排、强化学习与安全边界。
          </p>
          <div className="home-hero__actions">
            <button type="button" className="primary-action" onClick={openSearch}>
              <SearchIcon />
              Search 192 notes
              <kbd>⌘K</kbd>
            </button>
            <Link className="secondary-action" to="/section/claude-workflow-1">
              Start with Claude Code
              <ArrowIcon />
            </Link>
          </div>
        </div>

        <aside className="hero-index" aria-label="Atlas statistics">
          <div className="hero-index__head">
            <span>ATLAS</span>
            <span>VOL. 02</span>
          </div>
          <div className="hero-index__numbers">
            <strong>{catalog.sections.length}</strong>
            <span>indexed field notes</span>
          </div>
          <div className="hero-index__grid">
            <div>
              <b>{catalog.groups.length}</b>
              <span>research tracks</span>
            </div>
            <div>
              <b>18</b>
              <span>source systems</span>
            </div>
            <div>
              <b>100%</b>
              <span>browser native</span>
            </div>
          </div>
          <p>
            Primary-source engineering notes. Every article is loaded on demand,
            indexed locally and readable without an account.
          </p>
        </aside>
      </section>

      <section className="new-notes" aria-labelledby="new-notes-title">
        <div className="section-heading">
          <p className="kicker">RECENTLY INDEXED</p>
          <h2 id="new-notes-title">New entries</h2>
          <span>04</span>
        </div>
        <div className="new-notes__grid">
          {featured.map((section, index) => (
            <Link
              key={section.id}
              to={`/section/${section.id}`}
              className="new-note"
              style={{ "--note-order": index } as CSSProperties}
              onMouseEnter={() => preloadArticle(section)}
              onFocus={() => preloadArticle(section)}
            >
              <span className="new-note__index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="new-note__group">{section.groupTitle}</span>
              <strong>{section.title}</strong>
              <span className="new-note__meta">
                {section.readingMinutes} min read
                <ArrowIcon />
              </span>
            </Link>
          ))}
          <button type="button" className="new-note new-note--search" onClick={openSearch}>
            <CommandIcon />
            <strong>Find a specific concept</strong>
            <span>Search titles, headings and summaries.</span>
          </button>
        </div>
      </section>

      <section className="atlas" aria-labelledby="atlas-title">
        <div className="section-heading">
          <p className="kicker">RESEARCH TRACKS</p>
          <h2 id="atlas-title">The atlas</h2>
          <span>{String(catalog.groups.length).padStart(2, "0")}</span>
        </div>

        <div className="atlas-grid">
          {catalog.groups.map((group, groupIndex) => {
            const sections = sectionsByGroup.get(group.id) || [];
            return (
              <article
                className="atlas-card"
                key={group.id}
                data-tone={groupIndex % 5}
                style={{ "--atlas-order": groupIndex } as CSSProperties}
              >
                <header>
                  <span className="atlas-card__code">
                    T{String(groupIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="atlas-card__count">
                    {String(sections.length).padStart(2, "0")} notes
                  </span>
                </header>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
                <div className="atlas-card__links">
                  {sections.slice(0, 3).map((section) => (
                    <Link
                      key={section.id}
                      to={`/section/${section.id}`}
                      onMouseEnter={() => preloadArticle(section)}
                      onFocus={() => preloadArticle(section)}
                    >
                      <span>{String(section.order).padStart(2, "0")}</span>
                      <span>{section.menuTitle}</span>
                      <ArrowIcon />
                    </Link>
                  ))}
                </div>
                {sections.length > 3 ? (
                  <button
                    type="button"
                    className="atlas-card__more"
                    onClick={openSearch}
                  >
                    Browse all {sections.length} notes
                    <span>↗</span>
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <footer className="home-footer">
        <span>Agent Systems Field Guide</span>
        <span>Compiled from primary sources · Built with React and Vite</span>
      </footer>
    </div>
  );
}
