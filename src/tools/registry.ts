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
import { expenseTools } from "./expenses";

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
    ...searchTools,
    ...expenseTools
};

// Normalize all tool parameters to use SchemaType enums so Gemini actually recognizes them
function normalizeSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;

    const result: any = { ...schema };

    // Convert string type to SchemaType enum
    if (typeof result.type === 'string') {
        const typeMap: Record<string, any> = {
            'object': SchemaType.OBJECT,
            'string': SchemaType.STRING,
            'number': SchemaType.NUMBER,
            'boolean': SchemaType.BOOLEAN,
            'array': SchemaType.ARRAY,
            'integer': SchemaType.INTEGER,
        };
        result.type = typeMap[result.type.toLowerCase()] || result.type;
    }

    // Recursively normalize properties
    if (result.properties) {
        const normalized: any = {};
        for (const [key, value] of Object.entries(result.properties)) {
            normalized[key] = normalizeSchema(value);
        }
        result.properties = normalized;
    }

    // Normalize items (for arrays)
    if (result.items) {
        result.items = normalizeSchema(result.items);
    }

    return result;
}

export const getGeminiTools = (): FunctionDeclaration[] => {
    const tools = Object.values(toolRegistry).map(t => ({
        name: t.name,
        description: t.description,
        parameters: normalizeSchema(t.parameters)
    }));
    console.log(`[Registry] Registered ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
    return tools;
};
