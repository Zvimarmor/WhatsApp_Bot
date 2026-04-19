import { FunctionDeclaration } from "@google/generative-ai";
export interface Tool {
    name: string;
    description: string;
    parameters: any;
    execute: (args: any) => Promise<Record<string, any>>;
}
export declare const toolRegistry: Record<string, Tool>;
export declare const getGeminiTools: () => FunctionDeclaration[];
//# sourceMappingURL=registry.d.ts.map