import { useEffect, useState } from "react";
import { loadArticle } from "../lib/articles";
import type { ContentSection } from "../types";

type ArticleState =
  | { status: "loading"; html: "" }
  | { status: "ready"; html: string }
  | { status: "error"; html: ""; message: string };

export function useArticle(section: ContentSection | undefined) {
  const [state, setState] = useState<ArticleState>({
    status: "loading",
    html: "",
  });

  useEffect(() => {
    if (!section) {
      setState({ status: "error", html: "", message: "Article not found" });
      return;
    }

    let active = true;
    setState({ status: "loading", html: "" });
    loadArticle(section)
      .then((html) => {
        if (active) setState({ status: "ready", html });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          html: "",
          message:
            error instanceof Error ? error.message : "Unable to load article",
        });
      });

    return () => {
      active = false;
    };
  }, [section]);

  return state;
}
