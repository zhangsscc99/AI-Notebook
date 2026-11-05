export type StudyPlanStatus = "active" | "paused" | "completed";

export interface StudyPlan {
  id: string;
  title: string;
  body: string;
  status: StudyPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudyPlanInput {
  title: string;
  body: string;
  status: StudyPlanStatus;
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
