import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

export interface Tool {
    name: string;
    description: string;
    parameters: any;
    execute: (args: any) => Promise<Record<string, any>>;
}

import { calendarTools } from "./calendar";
import { taskTools } from "./tasks";
import { habitTools } from "./habits";
import { dailyStatusTools } from "./daily_status";
import { searchTools } from "./search";

export const toolRegistry: Record<string, Tool> = {
    get_current_time: {
        name: "get_current_time",
        description: "Returns the current date and time in Israel (Asia/Jerusalem timezone)",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        },
        execute: async () => {
            const timeInIsrael = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
            return { current_time: timeInIsrael };
        }
    },
    ...calendarTools,
    ...taskTools,
    ...habitTools,
    ...dailyStatusTools,
    ...searchTools
};

export const getGeminiTools = (): FunctionDeclaration[] => {
    return Object.values(toolRegistry).map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
    }));
};
