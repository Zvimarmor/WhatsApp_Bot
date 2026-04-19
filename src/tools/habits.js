"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.habitTools = void 0;
const memory_1 = require("../memory");
exports.habitTools = {
    track_habit: {
        name: "track_habit",
        description: "Start tracking a new habit or update an existing one.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the habit to track (e.g. 'drink water')" },
                frequency: { type: "string", description: "How often to do it (e.g. 'daily', 'weekly')" }
            },
            required: ["name", "frequency"]
        },
        execute: async (args) => {
            (0, memory_1.addHabit)(args.name, args.frequency);
            return { result: `Started tracking habit: ${args.name} (${args.frequency})` };
        }
    },
    log_habit: {
        name: "log_habit",
        description: "Log that a habit was completed today.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the habit completed" }
            },
            required: ["name"]
        },
        execute: async (args) => {
            (0, memory_1.logHabit)(args.name);
            return { result: `Logged habit: ${args.name} as done for today.` };
        }
    },
    list_habits: {
        name: "list_habits",
        description: "List all tracked habits and their statuses.",
        parameters: {
            type: "object",
            properties: {}
        },
        execute: async (args) => {
            const habits = (0, memory_1.getHabits)();
            return { habits };
        }
    }
};
//# sourceMappingURL=habits.js.map