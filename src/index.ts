import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { config } from './config';
import { analyzeIntent, analyzeAudio, analyzeImage } from './ai';
import { toolRegistry } from './tools/registry';

let lastResponseText = '';
let selfChatJid: string | null = null;

async function connectToWhatsApp() {
    console.log('--- ASTRA SYSTEM BOOT v3.0 ---');
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
                console.log('Logged out. Delete "auth_info_baileys" and restart.');
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

        const botId = sock.user?.id.split(':')[0] || '';
        const remoteJid = msg.key.remoteJid;

        const isAuthorized = remoteJid?.includes(botId) ||
            remoteJid?.includes('1443226456216') ||
            (config.ownerPhoneNumber && remoteJid?.includes(config.ownerPhoneNumber));

        if (!isAuthorized) return;

        // Cache self-chat JID
        if (!selfChatJid && remoteJid) {
            selfChatJid = remoteJid;
            console.log(`[Scheduler] Locked self-chat JID: ${selfChatJid}`);
        }

        try {
            // === Handle Voice Messages ===
            if (msg.message.audioMessage) {
                console.log('Processing voice message...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                const responseText = await analyzeAudio(buffer, mimeType);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Handle Image Messages (Receipt OCR) ===
            if (msg.message.imageMessage) {
                console.log('Processing image message...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                const caption = msg.message.imageMessage.caption || '';
                const prompt = caption
                    ? `המשתמש שלח תמונה עם הכיתוב: "${caption}". נתח את התמונה ועזור לו.`
                    : 'המשתמש שלח תמונה. אם זו קבלה, חלץ את הסכום, הקטגוריה והתיאור. אם לא, תאר את התמונה.';
                const responseText = await analyzeImage(buffer, mimeType, prompt);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Handle Text Messages ===
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) return;

            if (msg.key.fromMe && text === lastResponseText) return;

            console.log('Processing text message...');
            const responseText = await analyzeIntent(text);
            lastResponseText = responseText;

            // Check if user wants a voice reply
            const wantsVoice = /תקריאי|תגידי|voice|קולי/i.test(text);
            if (wantsVoice) {
                try {
                    const { textToSpeech } = await import('./tools/voice');
                    const audioBuffer = await textToSpeech(responseText);
                    await sock.sendMessage(remoteJid!, {
                        audio: audioBuffer,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true  // Send as voice note (push-to-talk)
                    });
                    return;
                } catch (ttsErr: any) {
                    console.error('[TTS] Failed, falling back to text:', ttsErr.message);
                }
            }

            await sock.sendMessage(remoteJid!, { text: responseText });

        } catch (err: any) {
            console.error('Error processing message:', err.message);
            await sock.sendMessage(remoteJid!, { text: "מצטערת, קרתה תקלה קטנה. נסה שוב." });
        }
    });
}

// === Proactive Notification Scheduler ===

function startProactiveScheduler(sock: any) {
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
        console.warn('[Scheduler] No self-chat JID cached. Skipping.');
        return;
    }

    try {
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

            // Expense summary for today
            try {
                const expenseRes = await toolRegistry.get_expense_summary.execute({ period: 'week' });
                if (expenseRes.total > 0) {
                    message += `\n💰 *הוצאות השבוע:* ${expenseRes.total} ₪\n`;
                }
            } catch { }

            if (tasks.length > 0) {
                message += `\n✅ *משימות שנשארו:* ${tasks.length}\n`;
            }

            message += `\nלילה טוב! 😴`;
        }

        lastResponseText = message;
        await sock.sendMessage(selfChatJid, { text: message });
        console.log(`[Scheduler] ${type} message sent.`);
    } catch (err: any) {
        console.error(`[Scheduler] Failed:`, err.message);
    }
}

connectToWhatsApp().catch(err => {
    console.error('Startup error:', err);
});
