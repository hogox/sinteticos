interface ScreenSvgTask {
    type?: string;
    url?: string;
}
interface ScreenSvgPersona {
    name?: string;
}
interface ScreenSvgOptions {
    extended?: boolean;
}
export declare function buildScreenSvg(screen: string, task: ScreenSvgTask, persona: ScreenSvgPersona, index: number, options?: ScreenSvgOptions): string;
export {};
