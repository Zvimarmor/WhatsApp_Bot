"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSelfChatJid = setSelfChatJid;
exports.startProactiveScheduler = startProactiveScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const registry_1 = require("./tools/registry");
const config_1 = require("./config");
let selfChatJid = null;
function setSelfChatJid(jid) {
    selfChatJid = jid;
}
function startProactiveScheduler(sock) {
    if (config_1.config.cliMode) {
        console.log('[Scheduler] CLI mode — skipping cron registration.');
        return;
    }
    console.log('[Scheduler] Starting cron jobs (Israel time)...');
    // 08:00 AM → Morning Briefing
    node_cron_1.default.schedule('0 8 * * *', async () => {
        console.log('[Scheduler] Morning briefing...');
        await sendProactiveMessage(sock, 'morning');
    }, { timezone: 'Asia/Jerusalem' });
    // 08:00 PM → Evening Summary
    node_cron_1.default.schedule('0 20 * * *', async () => {
        console.log('[Scheduler] Evening summary...');
        await sendProactiveMessage(sock, 'evening');
    }, { timezone: 'Asia/Jerusalem' });
    console.log('[Scheduler] Registered: 08:00 (morning) & 20:00 (evening)');
}
async function sendProactiveMessage(sock, type) {
    if (!selfChatJid) {
        if (config_1.config.ownerPhoneNumber) {
            selfChatJid = `${config_1.config.ownerPhoneNumber}@s.whatsapp.net`;
            console.log(`[Scheduler] Fallback to owner JID: ${selfChatJid}`);
        }
        else {
            console.warn('[Scheduler] No self-chat JID cached and no owner number in config. Skipping.');
            return;
        }
    }
    try {
        const calendarRes = await registry_1.toolRegistry.list_calendar_events.execute({ maxResults: 10 });
        const tasksRes = await registry_1.toolRegistry.read_pending_tasks_from_google_sheet.execute({});
        const events = calendarRes.events || [];
        const tasks = tasksRes.tasks || [];
        const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
        let message = '';
        if (type === 'morning') {
            message = `☀️ *בוקר טוב! סיכום יומי — ${today}*\n\n`;
            if (events.length > 0) {
                message += `📅 *אירועים היום:*\n`;
                events.forEach((e, i) => {
                    const time = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : 'כל היום';
                    message += `  ${i + 1}. ${e.summary} (${time})\n`;
                });
            }
            else {
                message += `📅 אין אירועים מתוכננים להיום.\n`;
            }
            message += `\n`;
            if (tasks.length > 0) {
                message += `✅ *משימות פתוחות:*\n`;
                tasks.slice(0, 3).forEach((t, i) => {
                    message += `  ${i + 1}. ${t.title}\n`;
                });
                if (tasks.length > 3)
                    message += `  ...ועוד ${tasks.length - 3} משימות\n`;
            }
            else {
                message += `✅ אין משימות פתוחות.\n`;
            }
            message += `\nיום פרודוקטיבי! 💪`;
        }
        else {
            message = `🌙 *ערב טוב! סיכום ערב — ${today}*\n\n`;
            // Expense summary for today (using week to capture recent expenses)
            try {
                const expenseRes = await registry_1.toolRegistry.get_expense_summary.execute({ period: 'week' });
                if (expenseRes.total > 0) {
                    message += `💰 *הוצאות שנרשמו היום/השבוע:* ${expenseRes.total} ₪\n`;
                }
                else {
                    message += `💰 לא נרשמו הוצאות.\n`;
                }
            }
            catch { }
            if (tasks.length > 0) {
                message += `\n✅ *תזכורת למחר - עדיפות עליונה:* ${tasks[0].title}\n`;
            }
            message += `\nלילה טוב! 😴`;
        }
        await sock.sendMessage(selfChatJid, { text: message });
        console.log(`[Scheduler] ${type} message sent.`);
    }
    catch (err) {
        console.error(`[Scheduler] Failed:`, err.message);
    }
}
//# sourceMappingURL=scheduler.js.map