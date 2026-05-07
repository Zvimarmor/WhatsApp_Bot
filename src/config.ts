import dotenv from 'dotenv';

dotenv.config();

export const config = {
    ownerPhoneNumber: (process.env.OWNER_PHONE_NUMBER || process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    calendarId: (process.env.CALENDAR_ID || 'primary').trim(),
    expenseSheetId: (process.env.EXPENSE_SHEET_ID || '').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
    cliMode: process.env.CLI_MODE === 'true',
    whitelistJids: (process.env.WHITELIST_JIDS || '').split(',').map(j => j.trim()).filter(Boolean),
};

// Boot-time validation (runs once at import)
if (!config.geminiApiKey) {
    console.warn('[Config] ⚠ GEMINI_API_KEY is not set!');
}
if (!config.ownerPhoneNumber) {
    console.warn('[Config] ⚠ OWNER_PHONE_NUMBER / OWNER_NUMBER is not set! Bot will only respond to self-chat.');
} else {
    console.log(`[Config] Owner number: ...${config.ownerPhoneNumber.slice(-4)}`);
}
