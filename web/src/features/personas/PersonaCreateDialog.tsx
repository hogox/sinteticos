import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { PersonaForm } from "./PersonaForm";
import {
  useGeneratePersonas,
  useExtractPersonasMulti,
  useCreatePersona
} from "@/api/queries";
import type { Persona } from "@/types/state";
import { cn } from "@/lib/cn";

type Mode = "advanced" | "simple" | "upload";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Persona | null;
}

export function PersonaCreateDialog({ open, onOpenChange, editing }: Props) {
  const [mode, setMode] = useState<Mode>("advanced");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? `Editar ${editing.name}` : "Nueva persona"}</DialogTitle>
        <DialogClose onClick={() => onOpenChange(false)} />
      </DialogHeader>
      <DialogBody>
        {!editing && (
          <div className="flex gap-1 border-b border-border -mt-2">
            {(["advanced", "simple", "upload"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                  mode === m
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "advanced" ? "Avanzado" : m === "simple" ? "Simple" : "Upload"}
              </button>
            ))}
          </div>
        )}

        {(editing || mode === "advanced") && (
          <PersonaForm persona={editing || undefined} onDone={() => onOpenChange(false)} />
        )}
        {!editing && mode === "simple" && <SimpleMode onDone={() => onOpenChange(false)} />}
        {!editing && mode === "upload" && <UploadMode onDone={() => onOpenChange(false)} />}
      </DialogBody>
    </Dialog>
  );
}

function SimpleMode({ onDone }: { onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(2);
  const [preview, setPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generate = useGeneratePersonas();
  const create = useCreatePersona();

  const handleGenerate = async () => {
    setError(null);
    if (!description.trim()) {
      setError("Escribí una descripción.");
      return;
    }
    try {
      const personas = await generate.mutateAsync({ description, quantity });
      setPreview(personas as unknown as Array<Record<string, unknown>>);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSave = async (personas: Array<Record<string, unknown>>) => {
    for (const p of personas) {
      await create.mutateAsync(p);
    }
    onDone();
  };

  if (preview) {
    return <PreviewList preview={preview} onSave={handleSave} onBack={() => setPreview(null)} />;
  }

  return (
    <div className="space-y-3">
      <Label>
        Describí brevemente la persona (un párrafo)
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Profesional comercial 35-45, viaja por trabajo cada 2 meses, decide en mobile entre reuniones, le frustra perder tiempo en pasos ambiguos…"
        />
      </Label>
      <Label className="max-w-[200px]">
        Cantidad
        <Input
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
        />
      </Label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button onClick={handleGenerate} disabled={generate.isPending}>
          {generate.isPending ? "Generando…" : "Generar preview"}
        </Button>
      </div>
    </div>
  );
}

function UploadMode({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState("");
  const [pasted, setPasted] = useState("");
  const [quantity, setQuantity] = useState(3);
  const [preview, setPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const extract = useExtractPersonasMulti();
  const create = useCreatePersona();

  const handleExtract = async () => {
    setError(null);
    if (!files.length && !urls.trim() && !pasted.trim()) {
      setError("Agregá archivos, URLs o texto pegado.");
      return;
    }
    const fd = new FormData();
    fd.append("quantity", String(quantity));
    files.forEach((f) => fd.append("files", f));
    urls
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean)
      .forEach((u) => fd.append("urls", u));
    if (pasted.trim()) fd.append("text", pasted);
    try {
      const result = await extract.mutateAsync(fd);
      setPreview(result.personas as unknown as Array<Record<string, unknown>>);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSave = async (personas: Array<Record<string, unknown>>) => {
    for (const p of personas) {
      await create.mutateAsync(p);
    }
    onDone();
  };

  if (preview) {
    return <PreviewList preview={preview} onSave={handleSave} onBack={() => setPreview(null)} />;
  }

  return (
    <div className="space-y-3">
      <Label>
        Archivos (PDF, Excel, texto)
        <input
          type="file"
          multiple
          accept=".pdf,.xls,.xlsx,.txt,.csv,.md"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
        />
      </Label>
      {files.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-5">
          {files.map((f, i) => (
            <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
          ))}
        </ul>
      )}
      <Label>
        URLs (una por línea)
        <Textarea
          rows={2}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder="https://blog.ejemplo.com/research-report"
        />
      </Label>
      <Label>
        Texto pegado
        <Textarea
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Pegá entrevistas, notas, fragmentos relevantes…"
        />
      </Label>
      <Label className="max-w-[200px]">
        Cantidad de personas a extraer
        <Input
          type="number"
          min={1}
          max={20}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
        />
      </Label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button onClick={handleExtract} disabled={extract.isPending}>
          {extract.isPending ? "Extrayendo…" : "Extraer preview"}
        </Button>
      </div>
    </div>
  );
}

interface PreviewProps {
  preview: Array<Record<string, unknown>>;
  onSave: (selected: Array<Record<string, unknown>>) => void | Promise<void>;
  onBack: () => void;
}

function PreviewList({ preview, onSave, onBack }: PreviewProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(preview.map((_, i) => i)));
  const [saving, setSaving] = useState(false);

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const list = preview.filter((_, i) => selected.has(i));
      await onSave(list);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        El modelo propuso {preview.length} personas. Elegí cuáles guardar.
      </p>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {preview.map((p, i) => (
          <article
            key={i}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              selected.has(i) ? "border-primary/50 bg-primary/5" : "border-border bg-card"
            )}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{String(p.name || `Persona ${i + 1}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {[p.age, p.gender, p.role].filter(Boolean).map(String).join(" · ") || String(p.segment || "Sin datos")}
                </p>
                {p.life_context ? (
                  <p className="text-xs text-muted-foreground">{String(p.life_context)}</p>
                ) : null}
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {String(p.description || p.usage_context || "")}
                </p>
              </div>
            </label>
          </article>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Volver
        </Button>
        <Button onClick={handleSave} disabled={saving || selected.size === 0}>
          {saving ? "Guardando…" : `Guardar ${selected.size}`}
        </Button>
      </div>
    </div>
  );
}
