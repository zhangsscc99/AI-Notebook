import { useEffect } from "react";
import AppShell from "./components/AppShell";
import ArticlePage from "./pages/ArticlePage";
import HomePage from "./pages/HomePage";
import StudyPlanPage from "./pages/StudyPlanPage";
import StudyPlansPage from "./pages/StudyPlansPage";
import { getSectionId, useRouter } from "./router";

export default function App() {
  const { pathname } = useRouter();

  useEffect(() => {
    if (pathname === "/") document.title = "Agent Systems Field Guide";
  }, [pathname]);

  const planMatch = pathname.match(/^\/plans(?:\/([^/]+))?(?:\/(edit))?\/?$/);
  const sectionId = getSectionId(pathname);
  let page;

  if (planMatch?.[1] === "new") {
    page = <StudyPlanPage creating />;
  } else if (planMatch?.[1]) {
    page = (
      <StudyPlanPage
        planId={decodeURIComponent(planMatch[1])}
        editing={planMatch[2] === "edit"}
      />
    );
  } else if (pathname === "/plans") {
    page = <StudyPlansPage />;
  } else if (sectionId === "study-plan-week-template") {
    page = <StudyPlanPage planId={sectionId} />;
  } else if (pathname === "/") {
    page = <HomePage />;
  } else {
    page = <ArticlePage sectionId={sectionId} />;
  }

  return (
    <AppShell>
      {page}
    </AppShell>
  );
}
