import { getRuntime } from "./store.js";
import { uid } from "./utils.js";
import { buildInitialState } from "../shared/seed-data.js";
import { simulateRun } from "../shared/simulation.js";
import {
  localCreateProject,
  localUpdateProject,
  localDeleteProject,
  localCreatePersona,
  localUpdatePersona,
  localDuplicatePersona,
  localArchivePersona,
  localDeletePersona,
  localCreateTask,
  localUpdateTask,
  localDeleteTask,
  localCreateRuns,
  localCreateCalibration,
  localDeleteRun,
  localCreatePersonaConversation,
  localSendPersonaMessage,
  loadLocalState,
  persistLocalState
} from "./state-ops.js";

async function request(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function createApi() {
  return {
    async health() {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error("health");
        }
        const payload = await response.json();
        return {
          mode: "backend",
          backend: true,
          runner: payload.runner || "simulated",
          mcp: payload.mcp || "optional",
          figma_mcp: payload.figma_mcp || false,
          skills: payload.skills || null
        };
      } catch (error) {
        return { mode: "browser", backend: false, runner: "simulated", mcp: "optional", figma_mcp: false };
      }
    },

    async loadState() {
      const runtime = getRuntime();
      if (runtime.backend) {
        const payload = await request("/api/state");
        return payload.state;
      }
      return loadLocalState();
    },

    async createProject(payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request("/api/projects", { method: "POST", body: JSON.stringify(payload) })).state;
      }
      const next = localCreateProject(payload);
      persistLocalState(next);
      return next;
    },

    async updateProject(id, payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
      }
      const next = localUpdateProject(id, payload);
      persistLocalState(next);
      return next;
    },

    async deleteProject(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/projects/${id}`, { method: "DELETE" })).state;
      }
      const next = localDeleteProject(id);
      persistLocalState(next);
      return next;
    },

    async createPersona(payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request("/api/personas", { method: "POST", body: JSON.stringify(payload) })).state;
      }
      const next = localCreatePersona(payload);
      persistLocalState(next);
      return next;
    },

    async updatePersona(id, payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/personas/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
      }
      const next = localUpdatePersona(id, payload);
      persistLocalState(next);
      return next;
    },

    async duplicatePersona(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/personas/${id}/duplicate`, { method: "POST" })).state;
      }
      const next = localDuplicatePersona(id);
      persistLocalState(next);
      return next;
    },

    async archivePersona(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/personas/${id}/archive`, { method: "POST" })).state;
      }
      const next = localArchivePersona(id);
      persistLocalState(next);
      return next;
    },

    async deletePersona(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/personas/${id}`, { method: "DELETE" })).state;
      }
      const next = localDeletePersona(id);
      persistLocalState(next);
      return next;
    },

    async createTask(payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request("/api/tasks", { method: "POST", body: JSON.stringify(payload) })).state;
      }
      const next = localCreateTask(payload);
      persistLocalState(next);
      return next;
    },

    async updateTask(id, payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) })).state;
      }
      const next = localUpdateTask(id, payload);
      persistLocalState(next);
      return next;
    },

    async deleteTask(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/tasks/${id}`, { method: "DELETE" })).state;
      }
      const next = localDeleteTask(id);
      persistLocalState(next);
      return next;
    },

    async createRuns(taskId, personaId, runCount) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (
          await request(`/api/tasks/${taskId}/runs`, {
            method: "POST",
            body: JSON.stringify({ personaId, runCount })
          })
        ).state;
      }
      const next = localCreateRuns(taskId, personaId, runCount);
      persistLocalState(next);
      return next;
    },

    async createCalibration(payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request("/api/calibrations", { method: "POST", body: JSON.stringify(payload) })).state;
      }
      const next = localCreateCalibration(payload);
      persistLocalState(next);
      return next;
    },

    async deleteRun(id) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/runs/${id}`, { method: "DELETE" })).state;
      }
      const next = localDeleteRun(id);
      persistLocalState(next);
      return next;
    },

    async rateAnalysis(id, feedback) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/analyses/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ feedback })
        })).state;
      }
      return null;
    },

    async rateRun(id, feedback) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/runs/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ feedback })
        })).state;
      }
      // local fallback: update in localStorage
      const state = JSON.parse(localStorage.getItem("sinteticos-lab-state-v2") || "{}");
      state.runs = (state.runs || []).map((r) => r.id === id ? { ...r, feedback: { ...feedback, rated_at: new Date().toISOString() } } : r);
      persistLocalState(state);
      return state;
    },

    async createPersonaConversation(personaId, payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request(`/api/personas/${personaId}/conversations`, { method: "POST", body: JSON.stringify(payload) })).state;
      }
      const next = localCreatePersonaConversation(personaId, payload);
      persistLocalState(next);
      return next;
    },

    async sendPersonaMessage(personaId, threadId, payload) {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (
          await request(`/api/personas/${personaId}/conversations/${threadId}/messages`, {
            method: "POST",
            body: JSON.stringify(payload)
          })
        ).state;
      }
      const next = localSendPersonaMessage(personaId, threadId, payload);
      persistLocalState(next);
      return next;
    },

    async aiGeneratePersonas(description, quantity) {
      const runtime = getRuntime();
      if (!runtime.backend) {
        const error = new Error("Los modos asistidos requieren correr el server local (npm start). En modo browser-only no están disponibles.");
        error.code = "NO_BACKEND";
        throw error;
      }
      const response = await fetch("/api/personas/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, quantity })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Request failed: ${response.status}`);
        error.code = payload.code || "REQUEST_FAILED";
        throw error;
      }
      return payload.personas || [];
    },

    async aiExtractPersonas(sourceText, quantity) {
      const runtime = getRuntime();
      if (!runtime.backend) {
        const error = new Error("Los modos asistidos requieren correr el server local (npm start). En modo browser-only no están disponibles.");
        error.code = "NO_BACKEND";
        throw error;
      }
      const response = await fetch("/api/personas/ai-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_text: sourceText, quantity })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Request failed: ${response.status}`);
        error.code = payload.code || "REQUEST_FAILED";
        throw error;
      }
      return payload.personas || [];
    },

    /**
     * Multi-source extraction: acepta archivos binarios (PDF, Excel, txt), URLs y texto pegado.
     * @param {{ files?: File[], urls?: string[], text?: string, quantity?: number }} input
     * @returns {Promise<{ personas: object[], sources: object[], stats: object }>}
     */
    async aiExtractPersonasMulti({ files = [], urls = [], text = "", quantity = 3 } = {}) {
      const runtime = getRuntime();
      if (!runtime.backend) {
        const error = new Error("Los modos asistidos requieren correr el server local (npm start). En modo browser-only no están disponibles.");
        error.code = "NO_BACKEND";
        throw error;
      }
      const formData = new FormData();
      formData.append("quantity", String(quantity));
      if (text) formData.append("text", text);
      urls.filter(Boolean).forEach((u) => formData.append("urls", u));
      Array.from(files || []).forEach((file) => formData.append("files", file, file.name));

      const response = await fetch("/api/personas/ai-extract-multi", {
        method: "POST",
        body: formData
        // NO seteamos Content-Type: el browser lo agrega con el boundary correcto.
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Request failed: ${response.status}`);
        error.code = payload.code || "REQUEST_FAILED";
        error.sources = payload.sources;
        throw error;
      }
      return {
        personas: payload.personas || [],
        sources: payload.sources || [],
        stats: payload.stats || {}
      };
    },

    async loadSkills() {
      const runtime = getRuntime();
      if (!runtime.backend || !runtime.skills?.providers_available?.length) return [];
      try {
        const data = await request("/api/skills");
        return data.skills || [];
      } catch { return []; }
    },

    async runSkill(skillName, { runIds, provider, persona_id, task_id } = {}) {
      return request(`/api/skills/${encodeURIComponent(skillName)}/run`, {
        method: "POST",
        body: JSON.stringify({ run_ids: runIds, provider, persona_id, task_id })
      });
    },

    async resetDemo() {
      const runtime = getRuntime();
      if (runtime.backend) {
        return (await request("/api/demo/reset", { method: "POST" })).state;
      }
      const next = buildInitialState(uid, (task, persona, iteration) =>
        simulateRun(task, persona, iteration, {
          uid,
          useChooseAction: true,
          engineLabel: "browser-simulated",
          sourceLabel: "client-local",
          executionNotes: "Fallback local sin backend ni Playwright.",
          completionStrategy: "client"
        })
      );
      persistLocalState(next);
      return next;
    }
  };
}

export const api = createApi();
