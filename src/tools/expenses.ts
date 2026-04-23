import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { addExpenseToDb, getExpenseSummaryFromDb } from '../memory';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');
const EXPENSES_TAB = 'Expenses';

let cachedSheetId: string | null = null;
let resolvedExpensesTabName: string | null = null;

async function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

// Find the astra_bot_expenses spreadsheet and ensure an "Expenses" tab exists or find the first one
async function getOrInitializeExpenseSheet(): Promise<{ id: string, tab: string } | null> {
    if (cachedSheetId && resolvedExpensesTabName) return { id: cachedSheetId, tab: resolvedExpensesTabName };

    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    try {
        const res = await drive.files.list({
            q: "name='astra_bot_expenses' and mimeType='application/vnd.google-apps.spreadsheet'",
            fields: 'files(id, name)',
        });

        const files = res.data.files;
        if (!files || files.length === 0 || !files[0].id) {
            console.error('[Expenses] Could not find spreadsheet named "astra_bot_expenses".');
            return null;
        }

        const sheetId = files[0].id;
        cachedSheetId = sheetId;

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheets_list = spreadsheet.data.sheets || [];

        // 1. Try to find a sheet named 'Expenses'
        let targetTab = sheets_list.find(s => s.properties?.title === EXPENSES_TAB);

        if (!targetTab) {
            // 2. If not found, and there's only one sheet (likely the default 'Sheet1' or 'גיליון1'), use it
            if (sheets_list.length === 1) {
                targetTab = sheets_list[0];
                console.log(`[Expenses] No 'Expenses' tab found, defaulting to the only existing tab: '${targetTab.properties?.title}'`);
            } else {
                // 3. If many sheets exist but none named 'Expenses', create it
                console.log(`[Expenses] Creating '${EXPENSES_TAB}' tab...`);
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: {
                        requests: [{ addSheet: { properties: { title: EXPENSES_TAB } } }]
                    }
                });
                // Re-fetch to get correct name (though we know it's EXPENSES_TAB now)
                resolvedExpensesTabName = EXPENSES_TAB;
            }
        }

        if (targetTab) {
            resolvedExpensesTabName = targetTab.properties?.title || EXPENSES_TAB;
        }

        console.log(`[Expenses] Target Tab identified as: '${resolvedExpensesTabName}'`);

        // Initialize headers if they don't exist in the target tab
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${resolvedExpensesTabName}'!A1:D1`,
        });

        const values = headerRes.data.values;
        if (!values || values.length === 0 || values[0].length === 0) {
            console.log(`[Expenses] Initializing headers in '${resolvedExpensesTabName}'...`);
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `'${resolvedExpensesTabName}'!A1:D1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['Date', 'Description', 'Amount', 'Category']]
                }
            });
        }

        return { id: sheetId, tab: resolvedExpensesTabName };
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

            // Save to local DB
            addExpenseToDb(args.amount, args.category, args.description, date);

            // Save to Google Sheets
            const sheetInfo = await getOrInitializeExpenseSheet();
            if (sheetInfo) {
                try {
                    const auth = await getAuthClient();
                    const sheets = google.sheets({ version: 'v4', auth });
                    console.log(`[Expenses] Appending to range: '${sheetInfo.tab}'!A:D`);
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: sheetInfo.id,
                        range: `'${sheetInfo.tab}'!A:D`,
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
