import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Fuse from "fuse.js";
import type { SearchRecord } from "../types";
import { ArrowIcon, CloseIcon, SearchIcon } from "./Icons";
import { useRouter } from "../router";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const { navigate } = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<SearchRecord[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    fetch("/search-index.json", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SearchRecord[]>;
      })
      .then(setRecords)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Search index unavailable",
        );
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const fuse = useMemo(
    () =>
      records
        ? new Fuse(records, {
            includeScore: true,
            minMatchCharLength: 2,
            threshold: 0.34,
            ignoreLocation: true,
            keys: [
              { name: "title", weight: 0.46 },
              { name: "menuTitle", weight: 0.2 },
              { name: "groupTitle", weight: 0.12 },
              { name: "headings", weight: 0.14 },
              { name: "searchText", weight: 0.08 },
            ],
          })
        : null,
    [records],
  );

  const results = useMemo(() => {
    if (!records) return [];
    if (!deferredQuery.trim()) return records.slice(0, 10);
    return (fuse?.search(deferredQuery) || []).slice(0, 20).map((item) => item.item);
  }, [deferredQuery, fuse, records]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [deferredQuery]);

  if (!open) return null;

  function choose(record: SearchRecord) {
    navigate(`/section/${record.id}`);
    onClose();
  }

  return (
    <div
      className="search-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-title"
      >
        <div className="search-dialog__input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) =>
                  Math.min(current + 1, results.length - 1),
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter" && results[selectedIndex]) {
                event.preventDefault();
                choose(results[selectedIndex]);
              }
            }}
            placeholder="Search concepts, projects, source paths…"
            aria-labelledby="search-title"
            aria-controls="search-results"
          />
          <button
            type="button"
            className="icon-button search-dialog__close"
            onClick={onClose}
            aria-label="Close search"
          >
            <CloseIcon />
          </button>
        </div>

        <h2 id="search-title" className="sr-only">
          Search field notes
        </h2>
        <div className="search-dialog__status" aria-live="polite">
          {!records && !error ? "Loading index…" : null}
          {error ? `Search unavailable: ${error}` : null}
          {records
            ? `${results.length} ${deferredQuery ? "matches" : "suggested notes"}`
            : null}
        </div>

        <div id="search-results" className="search-results" role="listbox">
          {results.map((record, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`search-result ${index === selectedIndex ? "is-selected" : ""}`}
              key={record.id}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => choose(record)}
            >
              <span className="search-result__index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="search-result__body">
                <small>{record.groupTitle}</small>
                <strong>{record.title}</strong>
                <span>{record.excerpt}</span>
              </span>
              <ArrowIcon />
            </button>
          ))}
          {records && results.length === 0 ? (
            <p className="search-empty">
              No notes matched “{deferredQuery}”. Try a shorter term.
            </p>
          ) : null}
        </div>

        <div className="search-dialog__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </section>
    </div>
  );
}
