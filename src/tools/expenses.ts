import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { addExpenseToDb, getExpenseSummaryFromDb } from '../memory';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');

async function getSheetsClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
    return google.sheets({ version: 'v4', auth });
}

export const expenseTools = {
    log_expense: {
        name: "log_expense",
        description: "Log an expense. Use when the user reports spending money (e.g. '50 שח על קפה').",
        parameters: {
            type: "object",
            properties: {
                amount: { type: "number", description: "Amount spent in NIS" },
                category: { type: "string", description: "Category: food, transport, health, shopping, bills, entertainment, other" },
                description: { type: "string", description: "Short description of the expense" }
            },
            required: ["amount", "category", "description"]
        },
        execute: async (args: any) => {
            const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
            const time = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });

            // Save to local DB
            addExpenseToDb(args.amount, args.category, args.description, date);

            // Save to Google Sheets if configured
            if (config.expenseSheetId) {
                try {
                    const sheets = await getSheetsClient();
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: config.expenseSheetId,
                        range: 'Sheet1!A:E',
                        valueInputOption: 'USER_ENTERED',
                        requestBody: {
                            values: [[date, time, args.category, args.description, args.amount]]
                        }
                    });
                } catch (err: any) {
                    console.error('[Expenses] Failed to write to Google Sheets:', err.message);
                }
            }

            return { result: `נרשמה הוצאה: ${args.amount} ₪ - ${args.description} (${args.category})` };
        }
    },
    get_expense_summary: {
        name: "get_expense_summary",
        description: "Get a summary of recent expenses. Can specify period: 'week' or 'month'.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", description: "'week' or 'month'" }
            }
        },
        execute: async (args: any) => {
            const period = args.period || 'week';
            const summary = getExpenseSummaryFromDb(period);
            return summary;
        }
    }
};
