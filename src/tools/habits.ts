import { addHabit, logHabit, getHabits } from '../memory';

export const habitTools = {
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
        execute: async (args: any) => {
            addHabit(args.name, args.frequency);
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
        execute: async (args: any) => {
            logHabit(args.name);
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
        execute: async (args: any) => {
            const habits = getHabits();
            return { habits };
        }
    }
};
