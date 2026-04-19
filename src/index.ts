import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from './config';
import { analyzeIntent } from './ai';

let lastResponseText = '';

async function connectToWhatsApp() {
    console.log('--- ASTRA SYSTEM BOOT VERSION 2026-04-17-01 ---');
    console.log('Starting Astra WhatsApp connection...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Fetch latest version of WhatsApp Web
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA version v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false, // Use our own qrcode-terminal
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

            console.log('Connection closed. Reason:', lastDisconnect?.error);
            console.log('Status Code:', statusCode);

            if (shouldReconnect) {
                console.log('Attempting to reconnect in 5 seconds...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('Disconnected. Please delete "auth_info_baileys" and restart if you want to re-authenticate.');
            }
        } else if (connection === 'open') {
            console.log('Astra successfully connected to WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        console.log(`Upsert Type: ${m.type}, count: ${m.messages.length}`);

        if (m.type !== 'notify' && m.type !== 'append') return;
        const msg = m.messages[0];
        if (!msg || !msg.message || !msg.key) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const botId = sock.user?.id.split(':')[0] || '';
        const remoteJid = msg.key.remoteJid;

        // Unified authorization check (Bot ID, Owner Number, or identified LID)
        const isAuthorized = remoteJid?.includes(botId) ||
            remoteJid?.includes('1443226456216') ||
            (config.ownerPhoneNumber && remoteJid?.includes(config.ownerPhoneNumber));

        if (isAuthorized) {
            // Loop prevention: don't respond to our own last response
            if (msg.key.fromMe && text === lastResponseText) {
                return;
            }

            console.log(`Processing message in self-chat...`);

            try {
                const responseText = await analyzeIntent(text);
                lastResponseText = responseText; // Cache it to prevent loop

                await sock.sendMessage(remoteJid!, { text: responseText });
            } catch (err: any) {
                console.error('Error processing message with Gemini:', err.message);
                if (err.message.includes("API key")) {
                    await sock.sendMessage(remoteJid!, { text: "שגיאת הגדרת מערכת: חסר מפתח Gemini API." });
                } else {
                    await sock.sendMessage(remoteJid!, { text: "מצטערת, קרתה תקלה קטנה בעיבוד ההודעה." });
                }
            }
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error('Unexpected error during startup:', err);
});
