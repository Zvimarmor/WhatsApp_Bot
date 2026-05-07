import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from './config';
import { analyzeIntent, analyzeAudio, analyzeImage } from './ai';
import { startProactiveScheduler, setSelfChatJid } from './scheduler';

// ─── Error Throttling ────────────────────────────────────────────────
let consecutiveErrors = 0;
const MAX_ERROR_MESSAGES = 2;
let lastResponseText = '';

async function connectToWhatsApp() {
    console.log('--- ASTRA SYSTEM BOOT v4.0 ---');
    console.log(`[Config] Owner: ${config.ownerPhoneNumber || '(NOT SET)'}`);
    console.log(`[Config] Gemini key: ${config.geminiApiKey ? '✓ set' : '✗ MISSING'}`);
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA] v${version.join('.')}, isLatest: ${isLatest}`);

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
            console.log(`[WA] Connection closed. Status: ${statusCode}`);
            if (shouldReconnect) {
                console.log('[WA] Reconnecting in 5s...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('[WA] Logged out. Delete "auth_info_baileys" and restart.');
            }
        } else if (connection === 'open') {
            console.log('[WA] ✓ Astra successfully connected to WhatsApp!');
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

        console.log(`[DEBUG WA] upsert: type=${m.type}, remote=${remoteJid}, fromMe=${isFromMe}, botId=${botId}`);

        // 1. HARD BLOCK: groups, broadcasts, status
        // Allow ONLY if explicitly whitelisted
        if (
            remoteJid.endsWith('@g.us') ||
            remoteJid.endsWith('@broadcast') ||
            remoteJid === 'status@broadcast'
        ) {
            if (!config.whitelistJids.includes(remoteJid)) {
                return;
            }
        }

        // 2. STRICT AUTHORIZATION
        const cleanRemote = remoteJid.replace(/\D/g, '');
        const cleanOwner = config.ownerPhoneNumber.replace(/\D/g, '');
        const isSelfChat = botId ? remoteJid.includes(botId) : false;
        // Match last 9 digits to handle 05x vs 9725x format mismatch
        const isOwner = cleanOwner.length > 0 && cleanRemote.endsWith(cleanOwner.slice(-9));
        const isWhitelisted = config.whitelistJids.includes(remoteJid);

        const isMyOwnJid = isSelfChat || isOwner;

        if (!isMyOwnJid && !isWhitelisted) {
            // Not a note-to-self, and not a whitelisted chat. Ignore silently.
            if (m.type === 'notify') {
                console.log(`[Auth] Ignored message (remoteJid=${remoteJid}, isFromMe=${isFromMe})`);
            }
            return;
        }

        // 3. LOOP PREVENTION (Bot Echo)
        // If the bot's own reply is echoed back, the text === lastResponseText check below handles it.
        // We DO NOT block all `fromMe: true` messages here, because we want the user to trigger the bot from their phone.

        console.log(`[Msg] From: ${remoteJid} (isMyOwnJid=${isMyOwnJid}, isWhitelisted=${isWhitelisted})`);
        const memBefore = process.memoryUsage();
        console.log(`[Mem] RSS=${Math.round(memBefore.rss / 1024 / 1024)}MB`);

        setSelfChatJid(remoteJid);

        try {
            // === Voice Messages ===
            if (msg.message.audioMessage) {
                console.log('[Voice] Downloading...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                console.log(`[Voice] ${buffer.length} bytes, analyzing...`);
                const responseText = await analyzeAudio(buffer, mimeType);
                lastResponseText = responseText;
                consecutiveErrors = 0; // ← success resets throttle
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Image Messages ===
            if (msg.message.imageMessage) {
                console.log('[Image] Downloading...');
                const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                const caption = msg.message.imageMessage.caption || '';
                const prompt = caption
                    ? `המשתמש שלח תמונה עם הכיתוב: "${caption}". נתח את התמונה ועזור לו.`
                    : 'חלץ מהקבלה את הסכום הכולל, בית העסק והקטגוריה, והשתמש בכלי write_expense_to_google_sheet_tab כדי לשמור אותם.';
                const responseText = await analyzeImage(buffer, mimeType, prompt);
                lastResponseText = responseText;
                consecutiveErrors = 0; // ← success resets throttle
                await sock.sendMessage(remoteJid!, { text: responseText });
                return;
            }

            // === Text Messages ===
            // Baileys wraps messages in various containers depending on context
            const msgContent = msg.message.ephemeralMessage?.message     // disappearing messages
                            || msg.message.viewOnceMessage?.message      // view-once
                            || msg.message.viewOnceMessageV2?.message    // view-once v2
                            || msg.message.documentWithCaptionMessage?.message // doc with caption
                            || msg.message.editedMessage?.message?.protocolMessage?.editedMessage // edited
                            || msg.message;                              // normal

            const text = msgContent?.conversation
                      || msgContent?.extendedTextMessage?.text
                      || msg.message.conversation
                      || msg.message.extendedTextMessage?.text;

            if (!text) {
                // Debug: show what keys ARE present so we can identify the format
                const keys = Object.keys(msg.message || {}).join(', ');
                console.log(`[Text] No text found. Message keys: [${keys}]`);
                return;
            }

            // Loop guard: don't respond to our own response echo
            if (msg.key.fromMe && text === lastResponseText) {
                console.log('[Loop] Own response echo. Skipping.');
                return;
            }

            console.log(`[Text] "${text.substring(0, 40)}..."`);
            const responseText = await analyzeIntent(text);
            lastResponseText = responseText;
            consecutiveErrors = 0; // ← success resets throttle

            // Voice reply if requested
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

            console.log(`[Send] ${responseText.length} chars`);
            await sock.sendMessage(remoteJid!, { text: responseText });

            const memAfter = process.memoryUsage();
            console.log(`[Mem] Post: RSS=${Math.round(memAfter.rss / 1024 / 1024)}MB`);

        } catch (err: any) {
            // ─── Error Throttling ─────────────────────────────
            consecutiveErrors++;
            console.error(`[Error] #${consecutiveErrors}:`, err.stack || err.message);

            if (consecutiveErrors <= MAX_ERROR_MESSAGES) {
                try {
                    await sock.sendMessage(remoteJid!, {
                        text: "⚠️ קרתה תקלה קטנה בעיבוד ההודעה. נסה שוב."
                    });
                } catch (sendErr) {
                    console.error('[Error] Could not send error message:', sendErr);
                }
            } else {
                console.warn(`[Throttle] Suppressed error message #${consecutiveErrors} to prevent spam loop.`);
            }
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error('[Fatal] Startup error:', err);
});
