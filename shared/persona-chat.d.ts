interface ChatPersona {
    id?: string;
    name?: string;
    description?: string;
    age?: string;
    gender?: string;
    life_context?: string;
    usage_context?: string;
    goals?: string;
    needs?: string;
    frictions?: string;
    pains?: string;
    digital_level?: string;
    digital_behavior?: string;
    [k: string]: unknown;
}
interface ChatRun {
    id: string;
    task_id?: string;
    completion_status?: string;
    step_log?: Array<{
        action: string;
        screen: string;
        [k: string]: unknown;
    }>;
    report_summary?: string;
    report_details?: {
        prioritized_findings?: Array<{
            label: string;
            [k: string]: unknown;
        }>;
    };
}
interface ChatTask {
    id: string;
    type?: string;
    prompt?: string;
    success_criteria?: string;
    status?: string;
}
interface ChatProject {
    id: string;
    name: string;
    description?: string;
}
interface ChatHistoryMessage {
    role: string;
    content: string;
    evidence_mode?: string | null;
}
interface BuildLocalReplyArgs {
    persona: ChatPersona;
    project?: ChatProject | null;
    tasks?: ChatTask[];
    runs?: ChatRun[];
    history?: ChatHistoryMessage[];
    message?: string;
    mode?: "free" | "evidence";
    anchorRunId?: string | null;
    kind?: "chat" | "hypothesis";
}
export declare function buildLocalPersonaReply({ persona, tasks, runs, message, mode, anchorRunId, kind }: BuildLocalReplyArgs): {
    verdict: "conditional" | "unclear";
    verdict_reason: string;
    conditions: string[];
    frictions: string[];
    reply: string;
    evidence_mode: string;
    reasoning_note: string;
    citations: {
        run_ids: never[];
        task_ids: never[];
    };
} | {
    reply: string;
    evidence_mode: string;
    reasoning_note: string;
    citations: {
        run_ids: string[];
        task_ids: string[];
    };
};
interface BuildContextArgs {
    persona: ChatPersona;
    project?: ChatProject | null;
    tasks?: ChatTask[];
    runs?: ChatRun[];
    anchorRunId?: string | null;
    history?: ChatHistoryMessage[];
}
export declare function buildPersonaChatContext({ persona, project, tasks, runs, anchorRunId, history }: BuildContextArgs): {
    project: {
        id: string;
        name: string;
        description: string | undefined;
    } | null;
    persona: ChatPersona;
    tasks: {
        id: string;
        type: string | undefined;
        prompt: string | undefined;
        success_criteria: string | undefined;
        status: string | undefined;
    }[];
    runs: {
        id: string;
        task_id: string | undefined;
        completion_status: string | undefined;
        report_summary: string | undefined;
        steps: {
            [k: string]: unknown;
            action: string;
            screen: string;
        }[];
        findings: {
            [k: string]: unknown;
            label: string;
        }[];
    }[];
    anchor_run: string | null;
    recent_messages: {
        role: string;
        content: string;
        evidence_mode: string | null;
    }[];
};
export {};
