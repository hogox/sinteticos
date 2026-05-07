interface SimTask {
    id: string;
    type?: string;
    url?: string;
    prompt?: string;
    success_criteria?: string;
    max_steps?: number | null;
    project_id?: string | null;
    mcp_enabled?: boolean;
    predictive_attention_enabled?: boolean;
    [k: string]: unknown;
}
interface SimPersona {
    id: string;
    name?: string;
    digital_level?: string;
    version?: number;
    project_id?: string | null;
    [k: string]: unknown;
}
interface SimulateRunOptions {
    uid: (prefix: string) => string;
    overrides?: {
        completion_status?: string;
        engine?: string;
        execution_notes?: string;
        source?: string;
    };
    svgOptions?: {
        extended?: boolean;
    };
    useChooseAction?: boolean;
    engineLabel?: string;
    sourceLabel?: string;
    executionNotes?: string;
    timingMultiplier?: number;
    completionStrategy?: "client" | "server";
}
export declare function simulateRun(task: SimTask, persona: SimPersona, iteration: number, options: SimulateRunOptions): {
    id: string;
    project_id: string | null;
    task_id: string;
    persona_id: string;
    persona_version: string;
    seed: string;
    status: string;
    started_at: string;
    ended_at: string;
    completion_status: string;
    persona_response: string;
    step_log: {
        step: number;
        screen: string;
        action: string;
        reason: string;
        certainty: number;
        timestamp: string;
    }[];
    click_points: {
        x: number;
        y: number;
        step: number;
        screen: string;
        certainty: number;
        weight: number;
    }[];
    screen_transitions: {
        from: string;
        to: string;
        step: number;
    }[];
    screenshots: {
        screen: string;
        step: number;
        src: string;
    }[];
    observed_heatmaps: {
        screen: string;
        points: {
            x: number;
            y: number;
            step: number;
            screen: string;
            certainty: number;
            weight: number;
        }[];
    }[];
    observed_scanpaths: {
        screen: string;
        points: {
            x: number;
            y: number;
            step: number;
            screen: string;
            certainty: number;
            weight: number;
        }[];
    }[];
    predicted_attention_maps: {
        screen: string;
        points: {
            x: number;
            y: number;
            step: number;
            screen: string;
            certainty: number;
            weight: number;
        }[];
        notes: string[];
    }[];
    report_summary: string;
    report_details: {
        primary_screen: string;
        prioritized_findings: import("./reporting.js").Finding[];
        trust_signals: string[];
        rejection_signals: string[];
    };
    follow_up_questions: string[];
    engine: string;
    execution_notes: string;
    mcp_enabled: boolean | undefined;
    source: string;
};
export {};
