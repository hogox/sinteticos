import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queries";
import { colorFor, initialsOf } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface Props {
  name: string;
  currentUrl?: string | null;
  personaId?: string;
  gender?: string;
  onFileSelect: (file: File, preview: string) => void;
}

export function AvatarPicker({ name, currentUrl, personaId, gender, onFileSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const color = colorFor(name || "?");
  const initials = initialsOf(name);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    onFileSelect(file, preview);
    e.target.value = "";
  };

  const handleRandom = async () => {
    if (!personaId) return;
    setError(null);
    setLoading(true);
    try {
      const state = await api.randomAvatar(personaId, gender);
      qc.setQueryData(queryKeys.state, state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-16 w-16 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-lg font-semibold"
        style={{ background: currentUrl ? "transparent" : color }}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Subir foto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRandom}
            disabled={!personaId || loading}
            title={!personaId ? "Guarda la persona primero para generar un avatar" : ""}
          >
            {loading ? "Generando…" : "Avatar aleatorio"}
          </Button>
        </div>
        {!personaId && (
          <p className="text-xs text-muted-foreground">
            Guarda la persona para habilitar el avatar aleatorio
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
