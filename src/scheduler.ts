import cron from 'node-cron';
import { toolRegistry } from './tools/registry';
import { config } from './config';

let selfChatJid: string | null = null;

export function setSelfChatJid(jid: string) {
    selfChatJid = jid;
}

export function startProactiveScheduler(sock: any) {
    console.log('[Scheduler] Starting cron jobs (Israel time)...');

    // 08:00 AM → Morning Briefing
    cron.schedule('0 8 * * *', async () => {
        console.log('[Scheduler] Morning briefing...');
        await sendProactiveMessage(sock, 'morning');
    }, { timezone: 'Asia/Jerusalem' });

    // 08:00 PM → Evening Summary
    cron.schedule('0 20 * * *', async () => {
        console.log('[Scheduler] Evening summary...');
        await sendProactiveMessage(sock, 'evening');
    }, { timezone: 'Asia/Jerusalem' });

    console.log('[Scheduler] Registered: 08:00 (morning) & 20:00 (evening)');
}

async function sendProactiveMessage(sock: any, type: 'morning' | 'evening') {
    if (!selfChatJid) {
        if (config.ownerPhoneNumber) {
            selfChatJid = `${config.ownerPhoneNumber}@s.whatsapp.net`;
            console.log(`[Scheduler] Fallback to owner JID: ${selfChatJid}`);
        } else {
            console.warn('[Scheduler] No self-chat JID cached and no owner number in config. Skipping.');
            return;
        }
    }

    try {
        const calendarRes = await toolRegistry.list_calendar_events.execute({ maxResults: 10 });
        const tasksRes = await toolRegistry.read_pending_tasks_from_google_sheet.execute({});
        
        const events = calendarRes.events || [];
        const tasks = tasksRes.tasks || [];

        const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });

        let message = '';

        if (type === 'morning') {
            message = `☀️ *בוקר טוב! סיכום יומי — ${today}*\n\n`;

            if (events.length > 0) {
                message += `📅 *אירועים היום:*\n`;
                events.forEach((e: any, i: number) => {
                    const time = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : 'כל היום';
                    message += `  ${i + 1}. ${e.summary} (${time})\n`;
                });
            } else {
                message += `📅 אין אירועים מתוכננים להיום.\n`;
            }

            message += `\n`;

            if (tasks.length > 0) {
                message += `✅ *משימות פתוחות:*\n`;
                tasks.slice(0, 3).forEach((t: any, i: number) => {
                    message += `  ${i + 1}. ${t.title}\n`;
                });
                if (tasks.length > 3) message += `  ...ועוד ${tasks.length - 3} משימות\n`;
            } else {
                message += `✅ אין משימות פתוחות.\n`;
            }

            message += `\nיום פרודוקטיבי! 💪`;

        } else {
            message = `🌙 *ערב טוב! סיכום ערב — ${today}*\n\n`;

            // Expense summary for today (using week to capture recent expenses)
            try {
                const expenseRes = await toolRegistry.get_expense_summary.execute({ period: 'week' });
                if (expenseRes.total > 0) {
                    message += `💰 *הוצאות שנרשמו היום/השבוע:* ${expenseRes.total} ₪\n`;
                } else {
                    message += `💰 לא נרשמו הוצאות.\n`;
                }
            } catch { }

            if (tasks.length > 0) {
                message += `\n✅ *תזכורת למחר - עדיפות עליונה:* ${tasks[0].title}\n`;
            }

            message += `\nלילה טוב! 😴`;
        }

        await sock.sendMessage(selfChatJid, { text: message });
        console.log(`[Scheduler] ${type} message sent.`);
    } catch (err: any) {
        console.error(`[Scheduler] Failed:`, err.message);
    }
}
