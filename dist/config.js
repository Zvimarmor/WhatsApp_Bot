"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    ownerPhoneNumber: (process.env.OWNER_PHONE_NUMBER || '').replace(/\D/g, ''),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    calendarId: (process.env.CALENDAR_ID || 'primary').trim(),
    expenseSheetId: (process.env.EXPENSE_SHEET_ID || '').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
};
//# sourceMappingURL=config.js.map