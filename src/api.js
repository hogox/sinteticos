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
          figma_mcp: payload.figma_mcp || false
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
