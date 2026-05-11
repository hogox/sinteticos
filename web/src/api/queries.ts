import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, type ProjectInput, type PersonaInput, type TaskInput, type CalibrationInput } from "./client";
import type { AppState, RunFeedback, AnalysisFeedback } from "@/types/state";

export const queryKeys = {
  state: ["state"] as const,
  skills: ["skills"] as const
};

export function useAppState() {
  return useQuery({
    queryKey: queryKeys.state,
    queryFn: api.getState,
    staleTime: 1000 * 30
  });
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: api.listSkills,
    staleTime: 1000 * 60 * 5
  });
}

export function useGeneratePersonas() {
  return useMutation({ mutationFn: ({ description, quantity }: { description: string; quantity: number }) =>
    api.generatePersonas(description, quantity)
  });
}

export function useExtractPersonasMulti() {
  return useMutation({ mutationFn: (form: FormData) => api.extractPersonasMulti(form) });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      personaId,
      payload
    }: {
      personaId: string;
      payload: Parameters<typeof api.createPersonaConversation>[1];
    }) => api.createPersonaConversation(personaId, payload),
    onSuccess: (data) => setStateCache(qc, data.state)
  });
}

export function usePostMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      personaId,
      threadId,
      payload
    }: {
      personaId: string;
      threadId: string;
      payload: Parameters<typeof api.postPersonaMessage>[2];
    }) => api.postPersonaMessage(personaId, threadId, payload),
    onSuccess: (state) => setStateCache(qc, state)
  });
}

export function useRunSkill() {
  return useMutation({
    mutationFn: ({
      name,
      payload
    }: {
      name: string;
      payload: { run_ids: string[]; persona_id?: string; task_id?: string; provider?: string };
    }) => api.runSkill(name, payload)
  });
}

function setStateCache(qc: QueryClient, state: AppState) {
  qc.setQueryData(queryKeys.state, state);
}

function useStateMutation<TArgs>(fn: (args: TArgs) => Promise<AppState>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => setStateCache(qc, state)
  });
}

export const useCreateProject = () => useStateMutation<ProjectInput>(api.createProject);
export const useUpdateProject = () =>
  useStateMutation<{ id: string; payload: Partial<ProjectInput> }>(({ id, payload }) =>
    api.updateProject(id, payload)
  );
export const useDeleteProject = () => useStateMutation<string>(api.deleteProject);

export const useCreatePersona = () => useStateMutation<PersonaInput>(api.createPersona);
export const useUpdatePersona = () =>
  useStateMutation<{ id: string; payload: PersonaInput }>(({ id, payload }) =>
    api.updatePersona(id, payload)
  );
export const useDeletePersona = () => useStateMutation<string>(api.deletePersona);

export const useCreateTask = () => useStateMutation<TaskInput>(api.createTask);
export const useUpdateTask = () =>
  useStateMutation<{ id: string; payload: TaskInput }>(({ id, payload }) => api.updateTask(id, payload));
export const useDeleteTask = () => useStateMutation<string>(api.deleteTask);

export const useCreateCalibration = () => useStateMutation<CalibrationInput>(api.createCalibration);

export function useExecuteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, runCount }: { taskId: string; runCount?: number }) =>
      api.executeRun(taskId, runCount),
    onSuccess: (state) => setStateCache(qc, state)
  });
}

export function useRateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: Omit<RunFeedback, "rated_at"> }) =>
      api.rateRun(id, feedback),
    onSuccess: (state) => setStateCache(qc, state)
  });
}

export function useRateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: Omit<AnalysisFeedback, "rated_at"> }) =>
      api.rateAnalysis(id, feedback),
    onSuccess: (state) => setStateCache(qc, state)
  });
}
