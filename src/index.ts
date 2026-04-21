import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { config } from './config';
import { analyzeIntent } from './ai';
import { toolRegistry } from './tools/registry';

let lastResponseText = '';
let selfChatJid: string | null = null;

async function connectToWhatsApp() {
    console.log('--- ASTRA SYSTEM BOOT v2.0 ---');
    console.log('Starting Astra WhatsApp connection...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        browser: ['Astra', 'Safari', '3.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- SCAN THIS QR CODE ---');
            qrcode.generate(qr, { small: true });
            console.log('-------------------------\n');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('Connection closed. Status:', statusCode);

            if (shouldReconnect) {
                console.log('Reconnecting in 5s...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('Logged out. Delete "auth_info_baileys" and restart to re-authenticate.');
            }
        } else if (connection === 'open') {
            console.log('Astra successfully connected to WhatsApp!');
            startProactiveScheduler(sock);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' && m.type !== 'append') return;
        const msg = m.messages[0];
        if (!msg || !msg.message || !msg.key) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const botId = sock.user?.id.split(':')[0] || '';
        const remoteJid = msg.key.remoteJid;

        const isAuthorized = remoteJid?.includes(botId) ||
            remoteJid?.includes('1443226456216') ||
            (config.ownerPhoneNumber && remoteJid?.includes(config.ownerPhoneNumber));

        if (isAuthorized) {
            // Cache the self-chat JID for proactive messages
            if (!selfChatJid && remoteJid) {
                selfChatJid = remoteJid;
                console.log(`[Scheduler] Locked self-chat JID: ${selfChatJid}`);
            }

            if (msg.key.fromMe && text === lastResponseText) {
                return;
            }

            console.log(`Processing message in self-chat...`);

            try {
                const responseText = await analyzeIntent(text);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid!, { text: responseText });
            } catch (err: any) {
                console.error('Error processing message:', err.message);
                await sock.sendMessage(remoteJid!, { text: "מצטערת, קרתה תקלה קטנה. נסה שוב." });
            }
        }
    });
}

// === Proactive Notification Scheduler ===

function startProactiveScheduler(sock: any) {
    console.log('[Scheduler] Starting proactive notification cron jobs (Israel time)...');

    // 08:00 AM Israel → Morning Briefing
    cron.schedule('0 8 * * *', async () => {
        console.log('[Scheduler] Triggering morning briefing...');
        await sendProactiveMessage(sock, 'morning');
    }, { timezone: 'Asia/Jerusalem' });

    // 08:00 PM Israel → Evening Summary
    cron.schedule('0 20 * * *', async () => {
        console.log('[Scheduler] Triggering evening summary...');
        await sendProactiveMessage(sock, 'evening');
    }, { timezone: 'Asia/Jerusalem' });

    console.log('[Scheduler] Cron jobs registered: 08:00 (morning) & 20:00 (evening)');
}

async function sendProactiveMessage(sock: any, type: 'morning' | 'evening') {
    if (!selfChatJid) {
        console.warn('[Scheduler] No self-chat JID cached yet. Skipping notification.');
        return;
    }

    try {
        // Gather data from tools
        const calendarRes = await toolRegistry.list_calendar_events.execute({ maxResults: 10 });
        const tasksRes = await toolRegistry.list_pending_tasks.execute({ maxResults: 20 });
        const habitsRes = await toolRegistry.list_habits.execute({});

        const events = calendarRes.events || [];
        const tasks = tasksRes.tasks || [];
        const habits = habitsRes.habits || [];

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
                message += `✅ *משימות פתוחות (${tasks.length}):*\n`;
                tasks.slice(0, 5).forEach((t: any, i: number) => {
                    message += `  ${i + 1}. ${t.title}\n`;
                });
                if (tasks.length > 5) message += `  ...ועוד ${tasks.length - 5} משימות\n`;
            } else {
                message += `✅ אין משימות פתוחות. יום נקי!\n`;
            }

            message += `\nיום פרודוקטיבי! 💪`;

        } else {
            message = `🌙 *ערב טוב! סיכום ערב — ${today}*\n\n`;

            const todayDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
            const unloggedHabits = habits.filter((h: any) => h.last_logged_date !== todayDate);

            if (unloggedHabits.length > 0) {
                message += `🧘 *הרגלים שטרם בוצעו:*\n`;
                unloggedHabits.forEach((h: any, i: number) => {
                    message += `  ${i + 1}. ${h.name} (${h.frequency})\n`;
                });
            } else if (habits.length > 0) {
                message += `🧘 כל ההרגלים בוצעו היום! 🎉\n`;
            }

            if (tasks.length > 0) {
                message += `\n✅ *משימות שנשארו:* ${tasks.length}\n`;
            }

            message += `\nלילה טוב! 😴`;
        }

        lastResponseText = message;
        await sock.sendMessage(selfChatJid, { text: message });
        console.log(`[Scheduler] ${type} message sent successfully.`);
    } catch (err: any) {
        console.error(`[Scheduler] Failed to send ${type} message:`, err.message);
    }
}

connectToWhatsApp().catch(err => {
    console.error('Unexpected error during startup:', err);
});
