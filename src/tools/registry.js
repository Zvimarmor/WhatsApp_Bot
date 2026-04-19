"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeminiTools = exports.toolRegistry = void 0;
const generative_ai_1 = require("@google/generative-ai");
const calendar_1 = require("./calendar");
const tasks_1 = require("./tasks");
const habits_1 = require("./habits");
const daily_status_1 = require("./daily_status");
exports.toolRegistry = {
    get_current_time: {
        name: "get_current_time",
        description: "Returns the current local server date and time",
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {},
        },
        execute: async () => {
            const timeInIsrael = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
            return { current_time: timeInIsrael };
        }
    },
    ...calendar_1.calendarTools,
    ...tasks_1.taskTools,
    ...habits_1.habitTools,
    ...daily_status_1.dailyStatusTools
};
const getGeminiTools = () => {
    return Object.values(exports.toolRegistry).map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
    }));
};
exports.getGeminiTools = getGeminiTools;
//# sourceMappingURL=registry.js.map