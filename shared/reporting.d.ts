interface RepPersona {
    name?: string;
    role?: string;
    segment?: string;
    digital_level?: string;
    [k: string]: unknown;
}
interface RepTask {
    type?: string;
    prompt?: string;
    success_criteria?: string;
    [k: string]: unknown;
}
export interface Finding {
    label: string;
    severity: "low" | "medium" | "high" | "critical";
    detail: string;
    priority?: number;
    framework_citation?: string;
}
interface StepLogEntry {
    step?: number;
    screen?: string;
    action?: string;
    certainty?: number;
    connectedCount?: number;
    candidateCount?: number;
    [k: string]: unknown;
}
interface ScreenTransition {
    from: string;
    to: string;
    step: number;
}
interface CoverageData {
    totalCandidates?: number;
    totalConnected?: number;
    coverageRatio?: number;
    fallbackSteps?: number;
    retriedSteps?: number;
    retriedSuccessfully?: number;
    totalRetryAttempts?: number;
    stepLog?: StepLogEntry[];
    screenTransitions?: ScreenTransition[];
}
export declare function composeStepReason(persona: RepPersona, task: RepTask, action: string, screen: string, certainty: number): string;
export declare function composePersonaResponse(persona: RepPersona, task: RepTask, status: string, findings: Finding[], stepCount: number): string;
export declare function summarizeRun(task: RepTask, persona: RepPersona, status: string, findings: Finding[]): string;
export declare function buildFindings(task: RepTask, persona: RepPersona, status: string, rng: () => number, coverageData?: CoverageData): Finding[];
export declare function buildFollowUps(task: RepTask, status: string): string[];
export declare function buildPredictedPoints(rng: () => number): {
    x: number;
    y: number;
    step: number;
    screen: string;
    certainty: number;
    weight: number;
}[];
export declare function buildPredictiveNotes(task: RepTask, persona: RepPersona): string[];
export declare function buildNavigationScreens(task: RepTask, rng: () => number, hostLabel: string): string[];
export {};
