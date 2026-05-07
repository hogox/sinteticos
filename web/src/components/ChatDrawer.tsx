import { useState, useEffect, useRef } from "react";
import { useUI } from "@/stores/ui";
import { useAppState, useCreateConversation, usePostMessage } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea, Select, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/utils";
import type { PersonaConversation, PersonaMessage } from "@/types/state";

export function ChatDrawer() {
  const drawer = useUI((s) => s.chatDrawer);
  const close = useUI((s) => s.closeChatDrawer);
  const setConv = useUI((s) => s.setActiveConversation);

  useEffect(() => {
    if (!drawer.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer.open, close]);

  if (!drawer.open || !drawer.personaId) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={close} aria-hidden />
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border flex flex-col">
        <ChatDrawerContent
          personaId={drawer.personaId}
          conversationId={drawer.conversationId}
          kind={drawer.kind}
          onSelectConversation={setConv}
          onClose={close}
        />
      </aside>
    </>
  );
}

interface ContentProps {
  personaId: string;
  conversationId: string | null;
  kind: "chat" | "hypothesis";
  onSelectConversation: (id: string | null) => void;
  onClose: () => void;
}

function ChatDrawerContent({ personaId, conversationId, kind, onSelectConversation, onClose }: ContentProps) {
  const { data: state } = useAppState();
  const createConv = useCreateConversation();

  const persona = state?.personas.find((p) => p.id === personaId);
  const conversations = (state?.persona_conversations || [])
    .filter((c) => c.persona_id === personaId && c.kind === kind);
  const activeConv = conversations.find((c) => c.id === conversationId) || null;

  const handleNew = async () => {
    const result = await createConv.mutateAsync({
      personaId,
      payload: {
        kind,
        title: kind === "hypothesis" ? "Hipótesis sin título" : "Chat principal",
        mode: "free"
      }
    });
    onSelectConversation(result.conversation.id);
  };

  if (!persona) return null;

  return (
    <>
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {kind === "hypothesis" ? "Hipótesis" : "Chat"}
          </p>
          <h3 className="text-sm font-semibold truncate">{persona.name}</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl" aria-label="Cerrar">
          ×
        </button>
      </header>

      {!activeConv ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Button onClick={handleNew} disabled={createConv.isPending} className="w-full">
            {createConv.isPending
              ? "Creando…"
              : kind === "hypothesis"
              ? "+ Nueva hipótesis"
              : "+ Nueva conversación"}
          </Button>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin conversaciones todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectConversation(c.id)}
                  className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
                >
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShortDate(c.updated_at)} · {c.messages.length} mensaje{c.messages.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ChatThread
          personaId={personaId}
          conversation={activeConv}
          state={state}
          onBack={() => onSelectConversation(null)}
        />
      )}
    </>
  );
}

function ChatThread({
  personaId,
  conversation,
  state,
  onBack
}: {
  personaId: string;
  conversation: PersonaConversation;
  state: ReturnType<typeof useAppState>["data"];
  onBack: () => void;
}) {
  const post = usePostMessage();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"free" | "evidence">(conversation.mode || "free");
  const [anchorRunId, setAnchorRunId] = useState(conversation.anchor_run_id || "");
  const scrollRef = useRef<HTMLDivElement>(null);

  const personaRuns = state?.runs.filter((r) => r.persona_id === personaId) || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.messages.length]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    await post.mutateAsync({
      personaId,
      threadId: conversation.id,
      payload: { content, mode, anchorRunId: anchorRunId || null }
    });
  };

  return (
    <>
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Lista
        </button>
        <p className="text-sm font-medium truncate flex-1">{conversation.title}</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {conversation.messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            Iniciá la conversación con tu pregunta.
          </p>
        )}
        {conversation.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {post.isPending && (
          <div className="text-xs text-muted-foreground italic">La persona está pensando…</div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border space-y-2 bg-card">
        <div className="grid grid-cols-2 gap-2">
          <Label className="text-xs">
            Modo
            <Select value={mode} onChange={(e) => setMode(e.target.value as "free" | "evidence")}>
              <option value="free">Libre</option>
              <option value="evidence">Solo evidencia</option>
            </Select>
          </Label>
          <Label className="text-xs">
            Anclar a run
            <Select value={anchorRunId} onChange={(e) => setAnchorRunId(e.target.value)}>
              <option value="">Sin anclar</option>
              {personaRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.report_summary?.slice(0, 40) || r.id}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            conversation.kind === "hypothesis"
              ? "Pregunta a la persona como entrevistador (¿usarías esto si…?)"
              : "Escribí algo y enter"
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={!text.trim() || post.isPending} size="sm">
            Enviar
          </Button>
        </div>
      </div>
    </>
  );
}

function Message({ message }: { message: PersonaMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {message.content}
      </div>
      {(message.verdict || message.reasoning_note) && !isUser && (
        <div className="mt-1 max-w-[88%] space-y-1 text-xs text-muted-foreground">
          {message.verdict && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={message.verdict === "yes" ? "success" : message.verdict === "no" ? "destructive" : "warning"}>
                {message.verdict}
              </Badge>
              {message.verdict_reason && <span>{message.verdict_reason}</span>}
            </div>
          )}
          {message.reasoning_note && <p className="italic">{message.reasoning_note}</p>}
          {message.frictions && (
            <p>
              <strong>Fricciones:</strong> {message.frictions}
            </p>
          )}
          {message.conditions && (
            <p>
              <strong>Condiciones:</strong> {message.conditions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
