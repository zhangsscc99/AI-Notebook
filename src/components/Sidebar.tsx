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

interface SidebarProps {
  mobileOpen: boolean;
  closeMobile: () => void;
  openSearch: () => void;
}

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
  const { ratedCount } = useProficiency();
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

        <nav className="topic-nav" aria-label="Research tracks">
          {catalog.groups.map((group, groupIndex) => {
            const sections = sectionsByGroup.get(group.id) || [];
            const isOpen = openGroups.has(group.id);
            const hasActive = activeGroupId === group.id;
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
                  <span className="topic-group__count">{sections.length}</span>
                  <ChevronIcon className={isOpen ? "is-rotated" : ""} />
                </button>
                {isOpen ? (
                  <div className="topic-group__links">
                    {sections.map((section) => (
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
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <span>Compiled from source code</span>
          <span>and primary documentation.</span>
        </div>
      </aside>
    </>
  );
}
