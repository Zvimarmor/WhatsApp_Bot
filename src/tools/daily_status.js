"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyStatusTools = void 0;
const tasks_1 = require("./tasks");
const habits_1 = require("./habits");
exports.dailyStatusTools = {
    get_daily_status: {
        name: "get_daily_status",
        description: "Get a unified daily status summary of pending Google Tasks and unlogged Habits.",
        parameters: { type: "object", properties: {} },
        execute: async () => {
            const tasksRes = await tasks_1.taskTools.list_pending_tasks.execute({ maxResults: 100 });
            const habitsRes = await habits_1.habitTools.list_habits.execute({});
            const pendingTasksCount = (tasksRes.tasks || []).length;
            const today = new Date().toISOString().split('T')[0];
            const incompleteHabits = (habitsRes.habits || []).filter((h) => h.last_logged_date !== today);
            const habitsCount = incompleteHabits.length;
            return {
                status_hebrew: `נשארו לך ${pendingTasksCount} משימות ו-${habitsCount} הרגלים להיום.`,
                raw_tasks: tasksRes.tasks,
                uncompleted_habits: incompleteHabits
            };
        }
    }
};
//# sourceMappingURL=daily_status.js.map