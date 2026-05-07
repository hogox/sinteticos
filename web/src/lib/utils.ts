const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#db2777",
  "#65a30d"
];

export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function initialsOf(name: string | null | undefined): string {
  return String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("es-CL", { month: "short", day: "numeric" });
}

export function labelDigitalLevel(level: string | null | undefined): string {
  if (level === "high") return "Nivel alto";
  if (level === "low") return "Nivel bajo";
  return "Nivel intermedio";
}
