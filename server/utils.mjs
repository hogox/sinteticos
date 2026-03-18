import crypto from "node:crypto";

export function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
