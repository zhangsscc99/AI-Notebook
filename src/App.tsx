import { useEffect } from "react";
import AppShell from "./components/AppShell";
import ArticlePage from "./pages/ArticlePage";
import HomePage from "./pages/HomePage";
import { getSectionId, useRouter } from "./router";

export default function App() {
  const { pathname } = useRouter();

  useEffect(() => {
    if (pathname === "/") document.title = "Agent Systems Field Guide";
  }, [pathname]);

  return (
    <AppShell>
      {pathname === "/" ? (
        <HomePage />
      ) : (
        <ArticlePage sectionId={getSectionId(pathname)} />
      )}
    </AppShell>
  );
}
