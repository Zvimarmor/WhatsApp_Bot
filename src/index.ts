import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from './config';
import { analyzeIntent, analyzeAudio, analyzeImage } from './ai';
import { startProactiveScheduler, setSelfChatJid } from './scheduler';

let lastResponseText = '';

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
        const remoteJid = msg.key.remoteJid || '';
        const isFromMe = msg.key.fromMe;

        // 1. HARD BLOCK
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
            return;
        }

        // 2. AUTHORIZATION
        const isSelfChat = remoteJid.includes(botId);
        const isOwner = config.ownerPhoneNumber && remoteJid.replace(/\D/g, '').includes(config.ownerPhoneNumber);

        if (!isSelfChat && !isOwner) {
            // Log once for unauthorized to ensure we aren't ignoring the owner
            if (m.type === 'notify') {
                console.log(`[Auth] Ignored message from ${remoteJid} (Not owner or self). Jid numbers: ${remoteJid.replace(/\D/g, '')}, Owner: ${config.ownerPhoneNumber}`);
            }
            return;
        }

        // 3. LOOP PREVENTION
        if (isFromMe && !isSelfChat) return;

        console.log(`[Auth] Processing message from: ${remoteJid} (Self: ${isSelfChat}, Owner: ${isOwner})`);
        const memBefore = process.memoryUsage();
        console.log(`[Memory] Pre-processing: RSS=${Math.round(memBefore.rss/1024/1024)}MB`);

        setSelfChatJid(remoteJid);

        try {
            // === Handle Voice Messages ===
            if (msg.message.audioMessage) {
                console.log('[Voice] Downloading audio...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                console.log(`[Voice] Analyzing ${buffer.length} bytes...`);
                const responseText = await analyzeAudio(buffer, mimeType);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Handle Image Messages ===
            if (msg.message.imageMessage) {
                console.log('[Image] Downloading image...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                const caption = msg.message.imageMessage.caption || '';
                console.log(`[Image] Analyzing with caption height: ${caption.length}...`);
                const prompt = caption
                    ? `המשתמש שלח תמונה עם הכיתוב: "${caption}". נתח את התמונה ועזור לו.`
                    : 'חלץ מהקבלה את הסכום הכולל, בית העסק והקטגוריה, והשתמש בכלי add_expense כדי לשמור אותם.';
                const responseText = await analyzeImage(buffer, mimeType, prompt);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Handle Text Messages ===
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) {
                console.log('[Text] No content found in message. Skipping.');
                return;
            }

            if (msg.key.fromMe && text === lastResponseText) {
                console.log('[Loop] Detected own response. Skipping.');
                return;
            }

            console.log(`[Text] Analyzing intent: "${text.substring(0, 30)}..."`);
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
                        ptt: true
                    });
                    return;
                } catch (ttsErr: any) {
                    console.error('[TTS] Failed:', ttsErr.message);
                }
            }

            console.log(`[Response] Sending message (${responseText.length} chars)`);
            await sock.sendMessage(remoteJid!, { text: responseText });
            
            const memAfter = process.memoryUsage();
            console.log(`[Memory] Post-processing: RSS=${Math.round(memAfter.rss/1024/1024)}MB`);

        } catch (err: any) {
            console.error('[Error] Processing failed:', err.stack || err.message);
            try {
                await sock.sendMessage(remoteJid!, { text: "⚠️ קרתה תקלה קטנה בעיבוד ההודעה. נסה שוב." });
            } catch (sendErr) {
                console.error('[Error] Could not send failure message:', sendErr);
            }
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error('Startup error:', err);
});
