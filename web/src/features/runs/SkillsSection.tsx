import { useState } from "react";
import type { Run, SkillRunResult } from "@/types/state";
import { useSkills, useRunSkill, useRateAnalysis } from "@/api/queries";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

interface Props {
  run: Run;
  projectRuns: Run[];
}

export function SkillsSection({ run, projectRuns }: Props) {
  const [tab, setTab] = useState<"run" | "batch">("run");
  const skills = useSkills();
  const runSkill = useRunSkill();
  const rateAnalysis = useRateAnalysis();

  const availableSkills = (skills.data || []).filter((s) => (tab === "batch" ? s.batch : !s.batch));
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const skillsForTab = availableSkills.map((s) => s.name);
  const effectiveSkill =
    selectedSkill && skillsForTab.includes(selectedSkill) ? selectedSkill : skillsForTab[0] || "";

  const lastResult = runSkill.data;

  const handleRun = () => {
    if (!effectiveSkill) return;
    const runIds = tab === "batch" ? projectRuns.map((r) => r.id) : [run.id];
    runSkill.mutate({
      name: effectiveSkill,
      payload: { run_ids: runIds, persona_id: run.persona_id, task_id: run.task_id }
    });
  };

  const handleRate = (analysisId: string, partial: { helpful?: boolean; accuracy?: number; surprised_me?: boolean }) => {
    rateAnalysis.mutate({
      id: analysisId,
      feedback: {
        helpful: partial.helpful ?? null,
        accuracy: partial.accuracy ?? null,
        surprised_me: partial.surprised_me ?? false,
        comment: ""
      }
    });
  };

  return (
    <article className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Análisis con skills</p>
          <h3 className="font-semibold">Razonamiento experto</h3>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(["run", "batch"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setSelectedSkill(""); runSkill.reset(); }}
              className={cn(
                "px-3 py-1 text-sm rounded transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {t === "run" ? "Este run" : "Todos los runs"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Select
          value={effectiveSkill}
          onChange={(e) => { setSelectedSkill(e.target.value); runSkill.reset(); }}
          className="flex-1"
        >
          {availableSkills.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </Select>
        <Button onClick={handleRun} disabled={runSkill.isPending || !effectiveSkill}>
          {runSkill.isPending ? "Analizando…" : "Analizar"}
        </Button>
      </div>

      {availableSkills.find((s) => s.name === effectiveSkill)?.description && (
        <p className="text-xs text-muted-foreground">
          {availableSkills.find((s) => s.name === effectiveSkill)?.description}
        </p>
      )}

      {lastResult && <SkillResult result={lastResult} onRate={handleRate} />}
    </article>
  );
}

interface ResultProps {
  result: SkillRunResult;
  onRate: (analysisId: string, partial: { helpful?: boolean; accuracy?: number; surprised_me?: boolean }) => void;
}

function SkillResult({ result, onRate }: ResultProps) {
  if (!result.ok) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-sm text-destructive font-medium">Error: {result.error}</p>
        {result.details && (
          <ul className="text-xs text-muted-foreground mt-1.5 list-disc pl-5">
            {result.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {result.provider && <Badge variant="outline">{result.provider}</Badge>}
        {result.model && <Badge variant="outline">{result.model}</Badge>}
        {result.latency_ms !== undefined && <Badge variant="outline">{result.latency_ms}ms</Badge>}
      </div>

      <SkillOutput output={result.output} />

      {result.analysis_id && (
        <AnalysisFeedbackBar
          analysisId={result.analysis_id}
          feedback={result.feedback}
          onRate={(partial) => onRate(result.analysis_id!, partial)}
        />
      )}
    </div>
  );
}

interface FeedbackProps {
  analysisId: string;
  feedback?: SkillRunResult["feedback"];
  onRate: (partial: { helpful?: boolean; accuracy?: number; surprised_me?: boolean }) => void;
}

function AnalysisFeedbackBar({ feedback, onRate }: FeedbackProps) {
  const helpful = feedback?.helpful;
  const accuracy = feedback?.accuracy || 0;
  const surprised = !!feedback?.surprised_me;

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1.5">
      <p className="font-medium">¿Te sirvió este análisis?</p>
      <div className="flex items-center flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onRate({ helpful: true })}
          className={cn(
            "px-2 py-0.5 rounded border text-base",
            helpful === true ? "bg-emerald-50 border-emerald-500" : "border-border"
          )}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => onRate({ helpful: false })}
          className={cn(
            "px-2 py-0.5 rounded border text-base",
            helpful === false ? "bg-red-50 border-red-500" : "border-border"
          )}
        >
          👎
        </button>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Precisión:</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate({ accuracy: n })}
              className={cn("text-base leading-none", accuracy >= n ? "text-amber-400" : "text-gray-300")}
              aria-label={`${n}`}
            >
              ★
            </button>
          ))}
        </div>
        <span className="text-muted-foreground">·</span>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={surprised}
            onChange={(e) => onRate({ surprised_me: e.target.checked })}
          />
          me sorprendió
        </label>
      </div>
    </div>
  );
}

function SkillOutput({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;

  // Generic formatted view: render each top-level key as a section.
  return (
    <div className="space-y-2 text-sm">
      {obj.summary !== undefined && (
        <p className="leading-relaxed">{String(obj.summary)}</p>
      )}
      {Array.isArray(obj.findings) && (obj.findings as Array<Record<string, unknown>>).length > 0 && (
        <FindingList items={obj.findings as Array<Record<string, unknown>>} title="Findings" />
      )}
      {Array.isArray(obj.issues) && (obj.issues as Array<Record<string, unknown>>).length > 0 && (
        <FindingList items={obj.issues as Array<Record<string, unknown>>} title="Issues" />
      )}
      {Array.isArray(obj.recommendations) && (obj.recommendations as Array<Record<string, unknown>>).length > 0 && (
        <FindingList items={obj.recommendations as Array<Record<string, unknown>>} title="Recomendaciones" />
      )}
      {Array.isArray(obj.evaluations) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Ver scorecard ({(obj.evaluations as unknown[]).length})
          </summary>
          <pre className="mt-2 whitespace-pre-wrap bg-muted/40 rounded p-2 text-[11px]">
            {JSON.stringify(obj.evaluations, null, 2)}
          </pre>
        </details>
      )}
      {Boolean(obj.verdict || obj.job_statement || obj.compliance_estimate) && (
        <div className="rounded-md border-l-4 border-primary bg-muted/40 p-3 space-y-1">
          {obj.verdict !== undefined && <p><strong>Verdict:</strong> {String(obj.verdict)}</p>}
          {obj.job_statement !== undefined && <p><strong>Job:</strong> {String(obj.job_statement)}</p>}
          {obj.compliance_estimate !== undefined && (
            <p><strong>Compliance:</strong> {String(obj.compliance_estimate)}</p>
          )}
        </div>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver JSON completo</summary>
        <pre className="mt-2 whitespace-pre-wrap bg-muted/40 rounded p-2 text-[11px] overflow-x-auto">
          {JSON.stringify(obj, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function FindingList({ items, title }: { items: Array<Record<string, unknown>>; title: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      <div className="space-y-2">
        {items.map((f, i) => {
          const severity = String(f.severity || f.priority || "");
          const variant: "destructive" | "warning" | "secondary" =
            severity === "critical" || severity === "high" ? "destructive"
            : severity === "medium" ? "warning"
            : "secondary";
          return (
            <article key={i} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <strong className="text-sm">{String(f.label || f.title || "Item")}</strong>
                {severity && <Badge variant={variant}>{severity}</Badge>}
              </div>
              {Boolean(f.detail) && <p className="text-sm text-muted-foreground">{String(f.detail)}</p>}
              {Boolean(f.recommendation) && (
                <p className="text-xs mt-1.5">
                  <strong>Sugerencia:</strong> {String(f.recommendation)}
                </p>
              )}
              {Boolean(f.framework_citation) && (
                <p className="text-xs text-muted-foreground italic mt-1">
                  Framework: {String(f.framework_citation)}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
