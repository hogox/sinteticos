/**
 * Test funcional: soporte web runs + Lighthouse.
 * Uso: node scripts/test-web-lighthouse.mjs
 */

import { strict as assert } from "node:assert";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => { console.log(`  ✓ ${name}`); passed++; })
        .catch((err) => { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// 1. isFigmaUrl
// ---------------------------------------------------------------------------
console.log("\n── isFigmaUrl ──");

const { isFigmaUrl } = await import("../server/url-utils.mjs");

await test("reconoce proto URL de Figma", () => {
  assert.equal(isFigmaUrl("https://www.figma.com/proto/abc123/App"), true);
});
await test("reconoce embed de Figma", () => {
  assert.equal(isFigmaUrl("https://embed.figma.com/proto/abc/file"), true);
});
await test("reconoce design URL de Figma", () => {
  assert.equal(isFigmaUrl("https://www.figma.com/design/xyz/name"), true);
});
await test("rechaza URL web normal", () => {
  assert.equal(isFigmaUrl("https://example.com"), false);
});
await test("rechaza URL con figma en path pero diferente dominio", () => {
  assert.equal(isFigmaUrl("https://example.com/figma/proto"), false);
});
await test("maneja string vacio", () => {
  assert.equal(isFigmaUrl(""), false);
});
await test("maneja null/undefined", () => {
  assert.equal(isFigmaUrl(null), false);
  assert.equal(isFigmaUrl(undefined), false);
});

// ---------------------------------------------------------------------------
// 2. Config — variables de Lighthouse exportadas
// ---------------------------------------------------------------------------
console.log("\n── Config ──");

const config = await import("../server/config.mjs");

await test("LIGHTHOUSE_ENABLED existe y es booleano", () => {
  assert.equal(typeof config.LIGHTHOUSE_ENABLED, "boolean");
});
await test("LIGHTHOUSE_TIMEOUT_MS existe y es numero positivo", () => {
  assert.equal(typeof config.LIGHTHOUSE_TIMEOUT_MS, "number");
  assert.ok(config.LIGHTHOUSE_TIMEOUT_MS > 0);
});
await test("BROWSER_HEADLESS existe", () => {
  assert.equal(typeof config.BROWSER_HEADLESS, "boolean");
});

// ---------------------------------------------------------------------------
// 3. Skill registry — lighthouse-analyst carga correctamente
// ---------------------------------------------------------------------------
console.log("\n── Skill registry ──");

const { loadSkillRegistry } = await import("../skills/_runtime/loader.mjs");
const registry = await loadSkillRegistry({ refresh: true });

await test("lighthouse-analyst esta en el registry", () => {
  assert.ok(registry.has("lighthouse-analyst"), "Skill no encontrado en registry");
});
await test("lighthouse-analyst tiene schema valido", () => {
  const skill = registry.get("lighthouse-analyst");
  assert.ok(skill.schema, "Sin schema");
  assert.equal(skill.schema.type, "object");
  assert.ok(Array.isArray(skill.schema.required));
  assert.ok(skill.schema.required.includes("summary"));
  assert.ok(skill.schema.required.includes("overall_verdict"));
  assert.ok(skill.schema.required.includes("findings"));
});
await test("lighthouse-analyst tiene inputs correctos", () => {
  const skill = registry.get("lighthouse-analyst");
  assert.ok(skill.inputs.includes("run"));
  assert.ok(skill.inputs.includes("persona"));
  assert.ok(skill.inputs.includes("task"));
});
await test("lighthouse-analyst NO es batch", () => {
  const skill = registry.get("lighthouse-analyst");
  assert.equal(skill.batch, false);
});
await test("lighthouse-analyst soporta anthropic", () => {
  const skill = registry.get("lighthouse-analyst");
  assert.ok(skill.providers.includes("anthropic"));
});

// ---------------------------------------------------------------------------
// 4. runLighthouse — auditoría real sobre example.com
// ---------------------------------------------------------------------------
console.log("\n── Lighthouse (example.com) ──");
console.log("  ⏳ Esto puede tardar ~30-60s...");

const { runLighthouse } = await import("../server/lighthouse-runner.mjs");

const lhResult = await runLighthouse("https://example.com", { formFactor: "desktop" });

await test("runLighthouse retorna un objeto (no null)", () => {
  assert.ok(lhResult !== null, "runLighthouse retorno null — verifica que Chromium este instalado (npx playwright install chromium)");
});

if (lhResult) {
  await test("resultado tiene scores", () => {
    assert.ok(lhResult.scores, "Sin campo scores");
    assert.ok("performance" in lhResult.scores);
    assert.ok("accessibility" in lhResult.scores);
    assert.ok("best_practices" in lhResult.scores);
    assert.ok("seo" in lhResult.scores);
  });
  await test("scores son numeros entre 0 y 100 o null", () => {
    for (const [key, val] of Object.entries(lhResult.scores)) {
      if (val !== null) {
        assert.ok(typeof val === "number", `${key} no es numero`);
        assert.ok(val >= 0 && val <= 100, `${key}=${val} fuera de rango`);
      }
    }
  });
  await test("resultado tiene url y lighthouse_version", () => {
    assert.ok(lhResult.url, "Sin campo url");
    assert.ok(lhResult.lighthouse_version, "Sin lighthouse_version");
  });
  await test("audits es un objeto", () => {
    assert.ok(typeof lhResult.audits === "object");
  });

  console.log("\n  Scores obtenidos:");
  for (const [key, val] of Object.entries(lhResult.scores)) {
    const bar = val !== null ? "█".repeat(Math.round(val / 10)) : "—";
    console.log(`    ${key.padEnd(16)} ${String(val ?? "—").padStart(3)}  ${bar}`);
  }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n── Resultado: ${passed}/${total} tests pasaron ──\n`);
if (failed > 0) {
  process.exit(1);
}
