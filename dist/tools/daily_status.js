"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyStatusTools = void 0;
const tasks_1 = require("./tasks");
const habits_1 = require("./habits");
exports.dailyStatusTools = {
    get_daily_status: {
        name: "get_daily_status",
        description: "Get a unified daily status summary of pending tasks and unlogged habits.",
        parameters: { type: "object", properties: {} },
        execute: async (args) => {
            const tasksRes = await tasks_1.taskTools.read_pending_tasks_from_google_sheet.execute({});
            const habitsRes = await habits_1.habitTools.list_habits.execute({});
            const tasks = tasksRes.tasks || [];
            const pendingTasksCount = tasks.length;
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
            const incompleteHabits = (habitsRes.habits || []).filter((h) => h.last_logged_date !== today);
            const habitsCount = incompleteHabits.length;
            return {
                status_hebrew: `נשארו לך ${pendingTasksCount} משימות ו-${habitsCount} הרגלים להיום.`,
                pending_tasks: tasks,
                uncompleted_habits: incompleteHabits
            };
        }
    }
};
//# sourceMappingURL=daily_status.js.map