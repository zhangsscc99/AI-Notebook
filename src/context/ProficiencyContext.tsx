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
const API_URL = "/api/proficiency";

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

async function fetchServerScores(): Promise<ProficiencyScores> {
  const response = await fetch(API_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`加载评分失败 (${response.status})`);
  const data = (await response.json()) as { scores?: ProficiencyScores };
  return data.scores || {};
}

async function uploadScores(scores: ProficiencyScores): Promise<ProficiencyScores> {
  const response = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scores }),
  });
  if (!response.ok) throw new Error(`保存评分失败 (${response.status})`);
  const data = (await response.json()) as { scores?: ProficiencyScores };
  return data.scores || scores;
}

export function ProficiencyProvider({ children }: { children: ReactNode }) {
  const [scores, setScores] = useState<ProficiencyScores>(readScores);

  useEffect(() => {
    let active = true;

    async function syncScores() {
      const localScores = readScores();
      try {
        const serverScores = await fetchServerScores();
        const missingScores = Object.fromEntries(
          Object.entries(localScores).filter(([sectionId]) => !(sectionId in serverScores)),
        );
        const next =
          Object.keys(missingScores).length > 0
            ? await uploadScores({ ...serverScores, ...missingScores })
            : serverScores;
        if (!active) return;
        persistScores(next);
        setScores(next);
      } catch {
        // Keep the local cache available if the server is temporarily unreachable.
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setScores(readScores());
    };
    window.addEventListener("storage", handleStorage);
    void syncScores();
    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
    };
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
      void uploadScores({ [sectionId]: score }).catch(() => {});
      return next;
    });
  }, []);

  const clearScore = useCallback((sectionId: string) => {
    setScores((current) => {
      if (!(sectionId in current)) return current;
      const next = { ...current };
      delete next[sectionId];
      persistScores(next);
      void fetch(API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, score: null }),
      }).catch(() => {});
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
