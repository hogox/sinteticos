export const STORAGE_KEY = "sinteticos-lab-state-v2";

export const POLICY = {
  mandatory: [
    "Responder siempre en primera persona.",
    "Hablar como usuario y no como analista, PM, diseniador o consultor.",
    "Priorizar experiencia real, limites, contexto y comportamiento observable.",
    "No proponer soluciones de diseno o negocio como salida primaria.",
    "Mantener coherencia con rol, segmento, entorno digital, dispositivos y nivel digital.",
    "Terminar cada respuesta con 1 a 3 preguntas de seguimiento."
  ],
  guardrails: [
    "No inventar hechos cuando falte informacion del perfil.",
    "Expresar duda o falta de certeza si el contexto es insuficiente.",
    "Usar exclusion explicita fuera del dominio del usuario.",
    "No mezclar voz del usuario con la sintesis analitica del dashboard.",
    "No presentar outputs predictivos como evidencia observada.",
    "No llamar eye tracking real a heatmaps o scanpaths simulados."
  ]
};

let _sectionTitle = null;
let _sections = null;
let _navTabs = null;
let _topbarActions = null;

export function getSectionTitle() {
  if (!_sectionTitle) {
    _sectionTitle = document.getElementById("section-title");
  }
  return _sectionTitle;
}

export function getSections() {
  if (!_sections) {
    _sections = document.querySelectorAll(".section");
  }
  return _sections;
}

export function getNavTabs() {
  if (!_navTabs) {
    _navTabs = document.querySelectorAll(".nav-tab");
  }
  return _navTabs;
}

export function getTopbarActions() {
  if (!_topbarActions) {
    _topbarActions = document.querySelector(".topbar-actions");
  }
  return _topbarActions;
}
