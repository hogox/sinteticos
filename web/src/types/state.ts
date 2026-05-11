export type DigitalLevel = "low" | "medium" | "high";

export type Emotion =
  | "neutral"
  | "frustrated"
  | "confused"
  | "rushed"
  | "curious"
  | "delighted"
  | "skeptical";

export type RunAction =
  | "click"
  | "click_text"
  | "click_vision"
  | "click_region"
  | "scroll"
  | "back"
  | "linger"
  | "complete"
  | "abandon";

export type CompletionStatus =
  | "completed"
  | "abandoned"
  | "uncertain"
  | "error";

export type TaskType = "navigation" | "idea" | "five_second_test";

export interface ProjectContext {
  domain_brief?: string;
  audience_constraints?: string;
  prior_findings?: string[];
  do_not?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  context?: ProjectContext | null;
  created_at: string;
  updated_at: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  age?: string;
  gender?: string;
  life_context?: string;
  avatar_url?: string | null;
  role: string;
  segment: string;
  functional_context?: string;
  usage_context?: string;
  goals?: string;
  motivations?: string;
  needs?: string;
  behaviors?: string;
  pains?: string;
  frictions?: string;
  personality_traits?: string;
  digital_environment?: string;
  digital_behavior?: string;
  devices?: string;
  digital_level?: DigitalLevel;
  apps_used?: string;
  restrictions?: string;
  attachments?: string;
  status: "active" | "archived";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  persona_id: string;
  type: TaskType;
  prompt: string;
  url?: string;
  success_criteria?: string;
  max_steps: number | null;
  mcp_enabled?: boolean;
  predictive_attention_enabled?: boolean;
  artifacts_enabled?: boolean;
  vision_enabled?: boolean;
  lighthouse_enabled?: boolean;
  lighthouse_form_factor?: "mobile" | "desktop";
  viewport_width?: number;
  viewport_height?: number;
  created_at: string;
  updated_at: string;
}

export interface StepLogEntry {
  step: number;
  screen: string;
  action: RunAction | string;
  reason: string;
  certainty: number;
  emotion?: Emotion;
  timestamp: string;
  candidateCount?: number;
  connectedCount?: number;
  fallbackUsed?: boolean;
  retryAttempt?: number;
}

export interface ClickPoint {
  x: number;
  y: number;
  step: number;
  screen: string;
  certainty: number;
  weight: number;
}

export interface ScreenTransition {
  from: string;
  to: string;
  step: number;
}

export interface Screenshot {
  src: string;
  screen: string;
  step: number;
}

export interface AttentionPoint {
  x: number;
  y: number;
  weight: number;
  label?: string;
  step?: number;
  screen?: string;
}

export interface ScanpathPoint {
  x: number;
  y: number;
  order?: number;
  step?: number;
  screen?: string;
  weight?: number;
}

export interface HeatmapLayer {
  screen: string;
  points: AttentionPoint[];
  notes?: string[];
}

export interface ScanpathLayer {
  screen: string;
  points: ScanpathPoint[];
}

export interface Finding {
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  priority?: number;
  framework_citation?: string;
}

export interface ReportDetails {
  primary_screen?: string;
  prioritized_findings: Finding[];
  trust_signals?: string[];
  rejection_signals?: string[];
  first_impression?: unknown;
  interaction_frame?: unknown;
  debug_artifacts?: unknown[];
}

export interface RunFeedback {
  rating: number | null;
  tags: string[];
  comment: string;
  rated_at: string;
}

export interface LighthouseScores {
  performance?: number;
  accessibility?: number;
  "best-practices"?: number;
  seo?: number;
}

export interface LighthouseData {
  scores: LighthouseScores;
  audits?: Record<string, unknown>;
  url: string;
  fetch_time: string;
  lighthouse_version?: string;
}

export interface Run {
  id: string;
  project_id: string | null;
  task_id: string;
  persona_id: string;
  persona_version: string;
  seed: string;
  status: "done" | "running" | "error";
  started_at: string;
  ended_at: string;
  completion_status: CompletionStatus;
  persona_response: string;
  step_log: StepLogEntry[];
  click_points: ClickPoint[];
  screen_transitions: ScreenTransition[];
  screenshots: Screenshot[];
  debug_artifacts: unknown[];
  observed_heatmaps: HeatmapLayer[];
  observed_scanpaths: ScanpathLayer[];
  predicted_attention_maps: HeatmapLayer[];
  report_summary: string;
  report_details: ReportDetails;
  follow_up_questions: string[];
  engine: string;
  execution_notes?: string;
  mcp_enabled?: boolean;
  source: string;
  lighthouse?: LighthouseData | null;
  feedback?: RunFeedback;
}

export interface Calibration {
  id: string;
  project_id: string;
  persona_id: string;
  task_id: string;
  prototype_version?: string;
  human_result: string;
  synthetic_result: string;
  critical_findings?: string;
  agreement: number;
  notes?: string;
  created_at: string;
}

export interface AnalysisFeedback {
  helpful: boolean | null;
  accuracy: number | null;
  surprised_me: boolean;
  comment: string;
  rated_at: string;
}

export interface RunAnalysis {
  id: string;
  run_ids: string[];
  skill: string;
  output: unknown;
  provider: string;
  model: string;
  latency_ms: number;
  created_at: string;
  feedback?: AnalysisFeedback;
}

export interface PersonaMessage {
  id: string;
  role: "user" | "persona";
  content: string;
  created_at: string;
  evidence_mode?: "free" | "evidence";
  reasoning_note?: string;
  citations?: unknown[];
  verdict?: string | null;
  verdict_reason?: string | null;
  conditions?: string | null;
  frictions?: string | null;
}

export interface PersonaConversation {
  id: string;
  persona_id: string;
  project_id?: string | null;
  kind: "chat" | "hypothesis";
  title: string;
  mode: "free" | "evidence";
  anchor_run_id?: string | null;
  messages: PersonaMessage[];
  created_at: string;
  updated_at: string;
}

export interface AppState {
  projects: Project[];
  personas: Persona[];
  tasks: Task[];
  runs: Run[];
  calibrations: Calibration[];
  run_analyses?: RunAnalysis[];
  persona_conversations?: PersonaConversation[];
}

export interface SkillDefinition {
  name: string;
  version: number;
  description: string;
  inputs: string[];
  providers: string[];
  batch: boolean;
}

export interface SkillRunResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  details?: string[];
  raw?: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  analysis_id?: string;
  feedback?: AnalysisFeedback;
}
