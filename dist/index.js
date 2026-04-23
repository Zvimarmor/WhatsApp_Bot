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
        // 1. HARD BLOCK: Never respond to groups, broadcasts or status
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
            return;
        }
        // 2. AUTHORIZATION: Only self-chat or designated owner
        const isSelfChat = remoteJid.includes(botId);
        const isOwner = config_1.config.ownerPhoneNumber && remoteJid.includes(config_1.config.ownerPhoneNumber);
        if (!isSelfChat && !isOwner)
            return;
        // 3. LOOP PREVENTION: Don't respond to our own messages in owner chat
        // (But allow them in self-chat if they aren't the exact last response to avoid loops)
        if (isFromMe && remoteJid !== botId && !remoteJid.includes(botId))
            return;
        console.log(`[Auth] Processing message from: ${remoteJid} (Self: ${isSelfChat}, Owner: ${isOwner})`);
        // Cache self-chat JID
        (0, scheduler_1.setSelfChatJid)(remoteJid);
        try {
            // === Handle Voice Messages ===
            if (msg.message.audioMessage) {
                console.log('Processing voice message...');
                const buffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
                const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                const responseText = await (0, ai_1.analyzeAudio)(buffer, mimeType);
                lastResponseText = responseText;
                await sock.sendMessage(remoteJid, { text: responseText });
                return;
            }
            // === Handle Image Messages (Receipt OCR) ===
            if (msg.message.imageMessage) {
                console.log('Processing image message...');
                const buffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
                const caption = msg.message.imageMessage.caption || '';
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
            if (!text)
                return;
            if (msg.key.fromMe && text === lastResponseText)
                return;
            console.log('Processing text message...');
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
                        ptt: true // Send as voice note (push-to-talk)
                    });
                    return;
                }
                catch (ttsErr) {
                    console.error('[TTS] Failed, falling back to text:', ttsErr.message);
                }
            }
            await sock.sendMessage(remoteJid, { text: responseText });
        }
        catch (err) {
            console.error('Error processing message:', err.message);
            await sock.sendMessage(remoteJid, { text: "מצטערת, קרתה תקלה קטנה. נסה שוב." });
        }
    });
}
connectToWhatsApp().catch(err => {
    console.error('Startup error:', err);
});
//# sourceMappingURL=index.js.map