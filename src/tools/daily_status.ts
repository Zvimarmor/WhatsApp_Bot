import { taskTools } from './tasks';
import { habitTools } from './habits';

export const dailyStatusTools = {
    get_daily_status: {
        name: "get_daily_status",
        description: "Get a unified daily status summary of pending tasks and unlogged habits.",
        parameters: { type: "object", properties: {} },
        execute: async () => {
            const tasksRes = await taskTools.list_pending_tasks.execute({});
            const habitsRes = await habitTools.list_habits.execute({});

            const tasks = tasksRes.tasks || [];
            const pendingTasksCount = tasks.length;

            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
            const incompleteHabits = (habitsRes.habits || []).filter((h: any) => h.last_logged_date !== today);
            const habitsCount = incompleteHabits.length;

            return {
                status_hebrew: `נשארו לך ${pendingTasksCount} משימות ו-${habitsCount} הרגלים להיום.`,
                pending_tasks: tasks,
                uncompleted_habits: incompleteHabits
            };
        }
    }
};
