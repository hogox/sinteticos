import type {
  AppState,
  RunFeedback,
  AnalysisFeedback,
  SkillDefinition,
  SkillRunResult,
  Project,
  Persona,
  Task,
  Calibration,
  PersonaConversation
} from "@/types/state";

export type ProjectInput = Pick<Project, "name" | "description"> & { context?: Project["context"] };
export type PersonaInput = Partial<Omit<Persona, "id" | "version" | "created_at" | "updated_at">>;
export type TaskInput = Partial<Omit<Task, "id" | "created_at" | "updated_at">>;
export type CalibrationInput = Partial<Omit<Calibration, "id" | "created_at">>;

class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, (json && (json.error || json.message)) || res.statusText, json);
  }
  return json as T;
}

export const api = {
  getState: () => request<{ state: AppState }>("/api/state").then((r) => r.state),

  createProject: (payload: ProjectInput) =>
    request<{ state: AppState }>("/api/projects", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.state),

  updateProject: (id: string, payload: Partial<ProjectInput>) =>
    request<{ state: AppState }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then(
      (r) => r.state
    ),

  deleteProject: (id: string) =>
    request<{ state: AppState }>(`/api/projects/${id}`, { method: "DELETE" }).then((r) => r.state),

  createPersona: (payload: PersonaInput) =>
    request<{ state: AppState }>("/api/personas", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.state),

  updatePersona: (id: string, payload: PersonaInput) =>
    request<{ state: AppState }>(`/api/personas/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then(
      (r) => r.state
    ),

  deletePersona: (id: string) =>
    request<{ state: AppState }>(`/api/personas/${id}`, { method: "DELETE" }).then((r) => r.state),

  createTask: (payload: TaskInput) =>
    request<{ state: AppState }>("/api/tasks", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.state),

  updateTask: (id: string, payload: TaskInput) =>
    request<{ state: AppState }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then(
      (r) => r.state
    ),

  deleteTask: (id: string) =>
    request<{ state: AppState }>(`/api/tasks/${id}`, { method: "DELETE" }).then((r) => r.state),

  createCalibration: (payload: CalibrationInput) =>
    request<{ state: AppState }>("/api/calibrations", { method: "POST", body: JSON.stringify(payload) }).then(
      (r) => r.state
    ),

  generatePersonas: (description: string, quantity: number) =>
    request<{ personas: PersonaInput[] }>("/api/personas/ai-generate", {
      method: "POST",
      body: JSON.stringify({ description, quantity })
    }).then((r) => r.personas),

  extractPersonas: (sourceText: string, quantity: number) =>
    request<{ personas: PersonaInput[] }>("/api/personas/ai-extract", {
      method: "POST",
      body: JSON.stringify({ source_text: sourceText, quantity })
    }).then((r) => r.personas),

  extractPersonasMulti: async (formData: FormData) => {
    const res = await fetch("/api/personas/ai-extract-multi", {
      method: "POST",
      body: formData
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json?.error || res.statusText, json);
    return json as { personas: PersonaInput[]; errors?: Array<{ source: string; message: string }> };
  },

  createPersonaConversation: (
    personaId: string,
    payload: {
      project_id?: string | null;
      kind?: "chat" | "hypothesis";
      title?: string;
      mode?: "free" | "evidence";
      anchorRunId?: string | null;
    }
  ) =>
    request<{ state: AppState; conversation: PersonaConversation }>(`/api/personas/${personaId}/conversations`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  postPersonaMessage: (
    personaId: string,
    threadId: string,
    payload: { content: string; mode?: "free" | "evidence"; anchorRunId?: string | null }
  ) =>
    request<{ state: AppState }>(`/api/personas/${personaId}/conversations/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload)
    }).then((r) => r.state),

  rateRun: (id: string, feedback: Omit<RunFeedback, "rated_at">) =>
    request<{ state: AppState }>(`/api/runs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback })
    }).then((r) => r.state),

  rateAnalysis: (id: string, feedback: Omit<AnalysisFeedback, "rated_at">) =>
    request<{ state: AppState }>(`/api/analyses/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback })
    }).then((r) => r.state),

  listSkills: () => request<{ skills: SkillDefinition[] }>("/api/skills").then((r) => r.skills),

  runSkill: (
    name: string,
    payload: { run_ids: string[]; persona_id?: string; task_id?: string; provider?: string }
  ) =>
    request<SkillRunResult>(`/api/skills/${encodeURIComponent(name)}/run`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  uploadAvatar: async (id: string, file: File): Promise<AppState> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/personas/${id}/avatar`, { method: "POST", body: fd });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json?.error || res.statusText, json);
    return (json as { state: AppState }).state;
  },

  randomAvatar: (id: string, gender?: string | null): Promise<AppState> =>
    request<{ state: AppState }>(`/api/personas/${id}/avatar/random`, {
      method: "POST",
      body: JSON.stringify({ gender })
    }).then((r) => r.state),

  executeRun: (taskId: string, runCount = 1): Promise<AppState> =>
    request<{ state: AppState }>(`/api/tasks/${taskId}/runs`, {
      method: "POST",
      body: JSON.stringify({ runCount })
    }).then((r) => r.state)
};

export { ApiError };
