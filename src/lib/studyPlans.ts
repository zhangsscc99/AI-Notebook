export type StudyPlanStatus = "active" | "paused" | "completed";

export interface StudyPlanChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StudyPlan {
  id: string;
  title: string;
  summary: string;
  goal: string;
  checklist: StudyPlanChecklistItem[];
  acceptance: string;
  deadline: string | null;
  status: StudyPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudyPlanInput {
  title: string;
  summary: string;
  goal: string;
  checklist: StudyPlanChecklistItem[];
  acceptance: string;
  deadline: string | null;
  status: StudyPlanStatus;
}

export function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function notifyPlansChanged() {
  window.dispatchEvent(new Event("study-plans-changed"));
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data as T;
}

export async function fetchStudyPlans(): Promise<StudyPlan[]> {
  const data = await request<{ plans: StudyPlan[] }>("/api/study-plans");
  return data.plans;
}

export async function fetchStudyPlan(id: string): Promise<StudyPlan> {
  const data = await request<{ plan: StudyPlan }>(
    `/api/study-plans/${encodeURIComponent(id)}`,
  );
  return data.plan;
}

export async function createStudyPlan(input: StudyPlanInput): Promise<StudyPlan> {
  const data = await request<{ plan: StudyPlan }>("/api/study-plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
  notifyPlansChanged();
  return data.plan;
}

export async function updateStudyPlan(
  id: string,
  input: StudyPlanInput,
): Promise<StudyPlan> {
  const data = await request<{ plan: StudyPlan }>(
    `/api/study-plans/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
  notifyPlansChanged();
  return data.plan;
}

export async function deleteStudyPlan(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/study-plans/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  notifyPlansChanged();
}

export function planProgress(plan: StudyPlan): number {
  if (plan.status === "completed") return 1;
  if (!plan.checklist.length) return plan.status === "active" ? 0.2 : 0;
  return plan.checklist.filter((item) => item.done).length / plan.checklist.length;
}
