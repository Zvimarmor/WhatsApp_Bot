"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeminiTools = exports.toolRegistry = void 0;
const generative_ai_1 = require("@google/generative-ai");
const calendar_1 = require("./calendar");
const tasks_1 = require("./tasks");
const habits_1 = require("./habits");
const daily_status_1 = require("./daily_status");
const search_1 = require("./search");
const expenses_1 = require("./expenses");
exports.toolRegistry = {
    get_current_time: {
        name: "get_current_time",
        description: "Returns the current date and time in Israel (Asia/Jerusalem timezone)",
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {},
        },
        execute: async () => {
            const timeInIsrael = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
            return { current_time: timeInIsrael };
        }
    },
    ...calendar_1.calendarTools,
    ...tasks_1.taskTools,
    ...habits_1.habitTools,
    ...daily_status_1.dailyStatusTools,
    ...search_1.searchTools,
    ...expenses_1.expenseTools
};
// Normalize all tool parameters to use SchemaType enums so Gemini actually recognizes them
function normalizeSchema(schema) {
    if (!schema || typeof schema !== 'object')
        return schema;
    const result = { ...schema };
    // Convert string type to SchemaType enum
    if (typeof result.type === 'string') {
        const typeMap = {
            'object': generative_ai_1.SchemaType.OBJECT,
            'string': generative_ai_1.SchemaType.STRING,
            'number': generative_ai_1.SchemaType.NUMBER,
            'boolean': generative_ai_1.SchemaType.BOOLEAN,
            'array': generative_ai_1.SchemaType.ARRAY,
            'integer': generative_ai_1.SchemaType.INTEGER,
        };
        result.type = typeMap[result.type.toLowerCase()] || result.type;
    }
    // Recursively normalize properties
    if (result.properties) {
        const normalized = {};
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
const getGeminiTools = () => {
    const tools = Object.values(exports.toolRegistry).map(t => ({
        name: t.name,
        description: t.description,
        parameters: normalizeSchema(t.parameters)
    }));
    console.log(`[Registry] Registered ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
    return tools;
};
exports.getGeminiTools = getGeminiTools;
//# sourceMappingURL=registry.js.map