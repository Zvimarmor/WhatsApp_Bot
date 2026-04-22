import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { addExpenseToDb, getExpenseSummaryFromDb } from '../memory';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');

let cachedExpenseSheetId: string | null = null;

async function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

// Helper to find the sheet and ensure headers exist
async function getOrInitializeExpenseSheet(): Promise<string | null> {
    if (cachedExpenseSheetId) return cachedExpenseSheetId;

    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.list({
            q: "name='astra_bot_expenses' and mimeType='application/vnd.google-apps.spreadsheet'",
            fields: 'files(id, name)',
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            console.error('[Expenses] Could not find spreadsheet named "astra_bot_expenses".');
            return null;
        }

        const sheetId = files[0].id;
        if (!sheetId) return null;

        cachedExpenseSheetId = sheetId;
        console.log(`[Expenses] Found expense sheet: ${sheetId}`);

        // Initialize headers if they don't exist
        const sheets = google.sheets({ version: 'v4', auth });
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1:D1',
        });

        const values = headerRes.data.values;
        if (!values || values.length === 0 || values[0].length === 0) {
            console.log('[Expenses] Initializing headers in expense sheet...');
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:D1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['Date', 'Description', 'Amount', 'Category']]
                }
            });
        }

        return sheetId;
    } catch (err: any) {
        console.error('[Expenses] Failed to get/init expense sheet:', err.message);
        return null;
    }
}

export const expenseTools = {
    add_expense: {
        name: "add_expense",
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

            // Save to Google Sheets
            const sheetId = await getOrInitializeExpenseSheet();
            if (sheetId) {
                try {
                    const auth = await getAuthClient();
                    const sheets = google.sheets({ version: 'v4', auth });
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: sheetId,
                        range: 'Sheet1!A:D',
                        valueInputOption: 'USER_ENTERED',
                        insertDataOption: 'INSERT_ROWS',
                        requestBody: {
                            values: [[
                                date,
                                args.description,
                                args.amount,
                                args.category
                            ]]
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
