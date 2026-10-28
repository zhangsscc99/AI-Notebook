import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowIcon, CopyIcon } from "../components/Icons";
import { useArticle } from "../hooks/useArticle";
import { preloadArticle } from "../lib/articles";
import {
  catalog,
  getAdjacentSections,
  groupById,
  sectionById,
} from "../lib/catalog";
import { Link } from "../router";

export default function ArticlePage({ sectionId }: { sectionId: string }) {
  const section = sectionById.get(sectionId);
  const group = section ? groupById.get(section.groupId) : undefined;
  const groupIndex = group
    ? catalog.groups.findIndex((item) => item.id === group.id)
    : -1;
  const { previous, next } = useMemo(
    () => getAdjacentSections(sectionId),
    [sectionId],
  );
  const article = useArticle(section);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!section) return;
    document.title = `${section.title} · Agent Systems Field Guide`;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [section]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const total =
          document.documentElement.scrollHeight - window.innerHeight;
        setProgress(total > 0 ? Math.min(1, window.scrollY / total) : 0);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sectionId]);

  useEffect(() => {
    preloadArticle(previous);
    preloadArticle(next);
  }, [next, previous]);

  if (!section || !group) {
    return (
      <div className="empty-state-page">
        <p className="kicker">404 / NOTE NOT FOUND</p>
        <h1>This field note has moved.</h1>
        <Link to="/" className="primary-action">
          Return to the atlas
          <ArrowIcon />
        </Link>
      </div>
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="article-page">
      <div
        className="reading-progress"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />

      <header className="article-header">
        <div className="article-header__crumbs">
          <Link to="/">Atlas</Link>
          <span>/</span>
          <span>{group.title}</span>
        </div>
        <div className="article-header__layout">
          <div className="article-header__copy">
            <p className="kicker">
              TRACK {String(groupIndex + 1).padStart(2, "0")} / NOTE{" "}
              {String(section.order).padStart(2, "0")}
            </p>
            <h1 ref={headingRef} tabIndex={-1}>
              {section.title}
            </h1>
            <div className="article-header__meta">
              <span>{section.readingMinutes} min read</span>
              <span>{group.title}</span>
              <span>{section.id}</span>
            </div>
          </div>
          <aside className="article-stamp" aria-hidden="true">
            <span>{String(groupIndex + 1).padStart(2, "0")}</span>
            <b>FIELD NOTE</b>
            <small>{String(section.order).padStart(2, "0")}</small>
          </aside>
        </div>
        <div className="article-actions">
          <button type="button" onClick={copyLink}>
            <CopyIcon />
            {copied ? "Link copied" : "Copy link"}
          </button>
          <Link to="/">
            <ArrowIcon />
            Back to atlas
          </Link>
        </div>
      </header>

      {article.status === "loading" ? <ArticleSkeleton /> : null}
      {article.status === "error" ? (
        <div className="article-error">
          <p className="kicker">LOAD ERROR</p>
          <h2>The note could not be loaded.</h2>
          <p>{article.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : null}
      {article.status === "ready" ? (
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />
      ) : null}

      <nav className="article-pagination" aria-label="Adjacent field notes">
        {previous ? (
          <Link
            to={`/section/${previous.id}`}
            className="pagination-link pagination-link--previous"
            onMouseEnter={() => preloadArticle(previous)}
          >
            <span>Previous note</span>
            <strong>{previous.title}</strong>
            <small>{previous.groupTitle}</small>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/section/${next.id}`}
            className="pagination-link pagination-link--next"
            onMouseEnter={() => preloadArticle(next)}
          >
            <span>Next note</span>
            <strong>{next.title}</strong>
            <small>{next.groupTitle}</small>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}

function ArticleSkeleton() {
  return (
    <div className="article-skeleton" aria-label="Loading article" role="status">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
