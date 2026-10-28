import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Sidebar from "./Sidebar";
import { MenuIcon, SearchIcon } from "./Icons";
import { SearchContext } from "../context/SearchContext";
import { Link } from "../router";

const SearchDialog = lazy(() => import("./SearchDialog"));

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
        openSearch={openSearch}
      />

      <div className="app-stage">
        <header className="mobile-bar">
          <button
            type="button"
            className="icon-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>
          <Link to="/" className="mobile-bar__brand">
            Agent Systems
          </Link>
          <button
            type="button"
            className="icon-button"
            onClick={openSearch}
            aria-label="Search"
          >
            <SearchIcon />
          </button>
        </header>

        <main id="main-content">
          <SearchContext.Provider value={{ openSearch }}>
            {children}
          </SearchContext.Provider>
        </main>
      </div>

      {searchOpen ? (
        <Suspense fallback={<div className="search-loading">Loading search…</div>}>
          <SearchDialog open={searchOpen} onClose={closeSearch} />
        </Suspense>
      ) : null}
    </div>
  );
}
