import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "agent-systems-field-guide:proficiency:v1";

type ProficiencyScores = Record<string, number>;

interface ProficiencyContextValue {
  scores: ProficiencyScores;
  ratedCount: number;
  getScore: (sectionId: string) => number | undefined;
  setScore: (sectionId: string, score: number) => void;
  clearScore: (sectionId: string) => void;
}

const ProficiencyContext = createContext<ProficiencyContextValue | null>(null);

function readScores(): ProficiencyScores {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, score]) =>
          typeof id === "string" &&
          Number.isInteger(score) &&
          Number(score) >= 1 &&
          Number(score) <= 10,
      ),
    ) as ProficiencyScores;
  } catch {
    return {};
  }
}

function persistScores(scores: ProficiencyScores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

export function ProficiencyProvider({ children }: { children: ReactNode }) {
  const [scores, setScores] = useState<ProficiencyScores>(readScores);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setScores(readScores());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setScore = useCallback((sectionId: string, score: number) => {
    if (
      !sectionId ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 10
    ) {
      return;
    }
    setScores((current) => {
      const next = { ...current, [sectionId]: score };
      persistScores(next);
      return next;
    });
  }, []);

  const clearScore = useCallback((sectionId: string) => {
    setScores((current) => {
      if (!(sectionId in current)) return current;
      const next = { ...current };
      delete next[sectionId];
      persistScores(next);
      return next;
    });
  }, []);

  const value = useMemo<ProficiencyContextValue>(
    () => ({
      scores,
      ratedCount: Object.keys(scores).length,
      getScore: (sectionId: string) => scores[sectionId],
      setScore,
      clearScore,
    }),
    [clearScore, scores, setScore],
  );

  return (
    <ProficiencyContext.Provider value={value}>
      {children}
    </ProficiencyContext.Provider>
  );
}

export function useProficiency() {
  const value = useContext(ProficiencyContext);
  if (!value) {
    throw new Error("useProficiency must be used inside ProficiencyProvider");
  }
  return value;
}
