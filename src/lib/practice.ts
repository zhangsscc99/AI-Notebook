export interface PracticeAttempt {
  answer: string;
  score: number;
  analysis: string;
  at: string;
}

export interface CoachEntry {
  q: string;
  reply: string;
  at: string;
}

export interface PracticeRecord {
  id: string;
  sectionId: string;
  sectionTitle: string;
  groupTitle: string;
  question: string;
  bestScore: number;
  createdAt: string;
  attempts: PracticeAttempt[];
  coach?: CoachEntry[];
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data as T;
}

export function generateQuestion(params: {
  title: string;
  groupTitle: string;
  context: string;
}): Promise<{ question: string }> {
  return post("/api/question", params);
}

export function scoreAnswer(params: {
  question: string;
  answer: string;
  title: string;
  context: string;
}): Promise<{ score: number; analysis: string }> {
  return post("/api/score", params);
}

export function saveAttempt(params: {
  id?: string;
  sectionId: string;
  sectionTitle: string;
  groupTitle: string;
  question: string;
  answer: string;
  score: number;
  analysis: string;
}): Promise<{ id: string; bestScore: number }> {
  return post("/api/history", params);
}

export function askCoach(params: {
  userQuestion: string;
  record: Pick<PracticeRecord, "question" | "attempts">;
  recordId?: string;
}): Promise<{ reply: string }> {
  return post("/api/ask", params);
}

export interface CodexProposal {
  slug: string;
  title: string;
  menuTitle: string;
  groupId: string | null;
  groupTitle: string | null;
  groupDescription: string | null;
  summary: string;
  html: string;
}

export function codexDraft(question: string): Promise<{ proposal: CodexProposal }> {
  return post("/api/codex-draft", { question });
}

export function codexCommit(proposal: CodexProposal): Promise<{ ok: boolean; slug: string }> {
  return post("/api/codex-commit", proposal);
}

export async function fetchHistory(): Promise<PracticeRecord[]> {
  const response = await fetch("/api/history");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "加载历史失败");
  return data.records || [];
}
