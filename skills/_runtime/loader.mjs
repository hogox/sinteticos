import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "..");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }
  return { meta: parseYaml(match[1]), body: match[2].trim() };
}

function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1];

    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      if (top.key && Array.isArray(top.container[top.key])) {
        top.container[top.key].push(parseScalar(value));
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    const target = top.container;

    if (!rawValue) {
      const next = lines[i + 1] || "";
      const nextTrim = next.trim();
      const isList = nextTrim.startsWith("- ");
      target[key] = isList ? [] : {};
      stack.push({ indent, container: target, key });
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1).trim();
      target[key] = inner
        ? inner.split(",").map((s) => parseScalar(s.trim()))
        : [];
      continue;
    }

    target[key] = parseScalar(rawValue);
  }
  return root;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function readSkillFolder(folderPath, name) {
  const skillFile = path.join(folderPath, "SKILL.md");
  let raw;
  try {
    raw = await fs.readFile(skillFile, "utf8");
  } catch {
    return null;
  }
  const { meta, body } = parseFrontmatter(raw);
  let schema = null;
  const schemaName = meta.output_schema || "schema.json";
  try {
    const schemaRaw = await fs.readFile(path.join(folderPath, schemaName), "utf8");
    schema = JSON.parse(schemaRaw);
  } catch {
    schema = null;
  }
  return {
    name: meta.name || name,
    version: meta.version || 1,
    description: meta.description || "",
    inputs: Array.isArray(meta.inputs) ? meta.inputs : [],
    providers: Array.isArray(meta.providers) ? meta.providers : ["anthropic", "openai", "google"],
    default_model: meta.default_model || {},
    batch: meta.batch === true,
    prompt: body,
    schema,
    folder: folderPath
  };
}

let cached = null;

export async function loadSkillRegistry({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const registry = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const skill = await readSkillFolder(path.join(SKILLS_DIR, entry.name), entry.name);
    if (skill) registry.set(skill.name, skill);
  }
  cached = registry;
  return registry;
}

export function listSkills(registry) {
  return [...registry.values()].map((s) => ({
    name: s.name,
    version: s.version,
    description: s.description,
    inputs: s.inputs,
    providers: s.providers,
    batch: s.batch
  }));
}

export function getSkill(registry, name) {
  return registry.get(name) || null;
}
