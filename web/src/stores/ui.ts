import { create } from "zustand";

interface ChatDrawerState {
  open: boolean;
  personaId: string | null;
  conversationId: string | null;
  kind: "chat" | "hypothesis";
}

interface UIState {
  lightboxSrc: string | null;
  setLightboxSrc: (src: string | null) => void;

  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;

  runDetailView: "observed" | "inferred" | "predictive";
  setRunDetailView: (v: "observed" | "inferred" | "predictive") => void;

  skillsTab: "run" | "batch";
  setSkillsTab: (t: "run" | "batch") => void;

  chatDrawer: ChatDrawerState;
  openChatDrawer: (personaId: string, kind?: "chat" | "hypothesis") => void;
  closeChatDrawer: () => void;
  setActiveConversation: (conversationId: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  lightboxSrc: null,
  setLightboxSrc: (src) => set({ lightboxSrc: src }),

  selectedRunId: null,
  setSelectedRunId: (id) => set({ selectedRunId: id }),

  runDetailView: "observed",
  setRunDetailView: (v) => set({ runDetailView: v }),

  skillsTab: "run",
  setSkillsTab: (t) => set({ skillsTab: t }),

  chatDrawer: { open: false, personaId: null, conversationId: null, kind: "chat" },
  openChatDrawer: (personaId, kind = "chat") =>
    set({ chatDrawer: { open: true, personaId, conversationId: null, kind } }),
  closeChatDrawer: () =>
    set((s) => ({ chatDrawer: { ...s.chatDrawer, open: false } })),
  setActiveConversation: (conversationId) =>
    set((s) => ({ chatDrawer: { ...s.chatDrawer, conversationId } }))
}));
