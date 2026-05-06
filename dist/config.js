"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    ownerPhoneNumber: (process.env.OWNER_PHONE_NUMBER || process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    calendarId: (process.env.CALENDAR_ID || 'primary').trim(),
    expenseSheetId: (process.env.EXPENSE_SHEET_ID || '').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
    cliMode: process.env.CLI_MODE === 'true',
};
// Boot-time validation (runs once at import)
if (!exports.config.geminiApiKey) {
    console.warn('[Config] ⚠ GEMINI_API_KEY is not set!');
}
if (!exports.config.ownerPhoneNumber) {
    console.warn('[Config] ⚠ OWNER_PHONE_NUMBER / OWNER_NUMBER is not set! Bot will only respond to self-chat.');
}
else {
    console.log(`[Config] Owner number: ...${exports.config.ownerPhoneNumber.slice(-4)}`);
}
//# sourceMappingURL=config.js.map