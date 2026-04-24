"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = require("@whiskeysockets/baileys");
const pino_1 = __importDefault(require("pino"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const config_1 = require("./config");
const ai_1 = require("./ai");
const scheduler_1 = require("./scheduler");
let lastResponseText = '';
async function connectToWhatsApp() {
    console.log('--- ASTRA SYSTEM BOOT v3.0 ---');
    console.log('Starting Astra WhatsApp connection...');
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('auth_info_baileys');
    const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
    const sock = (0, baileys_1.makeWASocket)({
        version,
        auth: state,
        logger: (0, pino_1.default)({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Astra', 'Safari', '3.0']
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n--- SCAN THIS QR CODE ---');
            qrcode_terminal_1.default.generate(qr, { small: true });
            console.log('-------------------------\n');
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
            console.log('Connection closed. Status:', statusCode);
            if (shouldReconnect) {
                console.log('Reconnecting in 5s...');
                setTimeout(connectToWhatsApp, 5000);
            }
            else {
                console.log('Logged out. Delete "auth_info_baileys" and restart.');
            }
        }
        else if (connection === 'open') {
            console.log('Astra successfully connected to WhatsApp!');
            (0, scheduler_1.startProactiveScheduler)(sock);
        }
    });
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' && m.type !== 'append')
            return;
        const msg = m.messages[0];
        if (!msg || !msg.message || !msg.key)
            return;
        const botId = sock.user?.id.split(':')[0] || '';
        const remoteJid = msg.key.remoteJid || '';
        const isFromMe = msg.key.fromMe;
        // 1. HARD BLOCK
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
            return;
        }
        // 2. AUTHORIZATION
        const cleanRemote = remoteJid.replace(/\D/g, '');
        const cleanOwner = config_1.config.ownerPhoneNumber.replace(/\D/g, '');
        const isSelfChat = remoteJid.includes(botId);
        // Match last 9 digits to handle 05x vs 9725x
        const isOwner = cleanOwner && cleanRemote.endsWith(cleanOwner.slice(-9));
        if (!isSelfChat && !isOwner) {
            if (m.type === 'notify') {
                console.log(`[Auth] Ignored message from ${remoteJid}. Remote cleaned: ${cleanRemote}, Owner cleaned: ${cleanOwner}`);
            }
            return;
        }
        // 3. LOOP PREVENTION
        if (isFromMe && !isSelfChat)
            return;
        console.log(`[Auth] Processing message from: ${remoteJid} (Self: ${isSelfChat}, Owner: ${isOwner})`);
        const memBefore = process.memoryUsage();
        console.log(`[Memory] Pre-processing: RSS=${Math.round(memBefore.rss / 1024 / 1024)}MB`);
        (0, scheduler_1.setSelfChatJid)(remoteJid);
        try {
            // === Handle Voice Messages ===
            if (msg.message.audioMessage) {
                console.log('[Voice] Downloading audio...');
                const buffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
                const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                console.log(`[Voice] Analyzing ${buffer.length} bytes...`);
                const responseText = await (0, ai_1.analyzeAudio)(buffer, mimeType);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid, { text: responseText });
                return;
            }
            // === Handle Image Messages ===
            if (msg.message.imageMessage) {
                console.log('[Image] Downloading image...');
                const buffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                const caption = msg.message.imageMessage.caption || '';
                console.log(`[Image] Analyzing with caption height: ${caption.length}...`);
                const prompt = caption
                    ? `המשתמש שלח תמונה עם הכיתוב: "${caption}". נתח את התמונה ועזור לו.`
                    : 'חלץ מהקבלה את הסכום הכולל, בית העסק והקטגוריה, והשתמש בכלי add_expense כדי לשמור אותם.';
                const responseText = await (0, ai_1.analyzeImage)(buffer, mimeType, prompt);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid, { text: responseText });
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
            const responseText = await (0, ai_1.analyzeIntent)(text);
            lastResponseText = responseText;
            // Check if user wants a voice reply
            const wantsVoice = /תקריאי|תגידי|voice|קולי/i.test(text);
            if (wantsVoice) {
                try {
                    const { textToSpeech } = await Promise.resolve().then(() => __importStar(require('./tools/voice')));
                    const audioBuffer = await textToSpeech(responseText);
                    await sock.sendMessage(remoteJid, {
                        audio: audioBuffer,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true
                    });
                    return;
                }
                catch (ttsErr) {
                    console.error('[TTS] Failed:', ttsErr.message);
                }
            }
            console.log(`[Response] Sending message (${responseText.length} chars)`);
            await sock.sendMessage(remoteJid, { text: responseText });
            const memAfter = process.memoryUsage();
            console.log(`[Memory] Post-processing: RSS=${Math.round(memAfter.rss / 1024 / 1024)}MB`);
        }
        catch (err) {
            console.error('[Error] Processing failed:', err.stack || err.message);
            try {
                await sock.sendMessage(remoteJid, { text: "⚠️ קרתה תקלה קטנה בעיבוד ההודעה. נסה שוב." });
            }
            catch (sendErr) {
                console.error('[Error] Could not send failure message:', sendErr);
            }
        }
    });
}
connectToWhatsApp().catch(err => {
    console.error('Startup error:', err);
});
//# sourceMappingURL=index.js.map