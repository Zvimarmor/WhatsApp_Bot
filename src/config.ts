import dotenv from 'dotenv';

dotenv.config();

export const config = {
    ownerPhoneNumber: (process.env.OWNER_PHONE_NUMBER || '').replace(/\D/g, ''),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    calendarId: (process.env.CALENDAR_ID || 'primary').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
};
