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

// Strictly targets the 'Expenses' worksheet tab. Creates it if missing.
async function getOrInitializeExpenseSheet(): Promise<{ id: string, tab: string }> {
    if (cachedSheetId && resolvedExpensesTabName) return { id: cachedSheetId, tab: resolvedExpensesTabName };

    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        q: "name='astra_bot_expenses' and mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id)',
    });

    const files = res.data.files;
    if (!files || files.length === 0 || !files[0].id) {
        throw new Error("Spreadsheet 'astra_bot_expenses' not found.");
    }
    const sheetId = files[0].id;
    cachedSheetId = sheetId;

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheets_list = spreadsheet.data.sheets || [];

    // Find 'Expenses' tab
    let targetTab = sheets_list.find(s => s.properties?.title === EXPENSES_TAB);

    if (!targetTab) {
        console.log(`[Expenses] '${EXPENSES_TAB}' tab not found. Creating it immediately...`);
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
                requests: [{ addSheet: { properties: { title: EXPENSES_TAB } } }]
            }
        });
        resolvedExpensesTabName = EXPENSES_TAB;
    } else {
        resolvedExpensesTabName = targetTab.properties?.title || EXPENSES_TAB;
    }

    console.log(`[Expenses] Target tab active: '${resolvedExpensesTabName}'`);

    // Initialize headers ONLY if completely empty
    const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${resolvedExpensesTabName}'!A1:Z100`,
    });

    if (!checkRes.data.values || checkRes.data.values.length === 0) {
        console.log(`[Expenses] Tab is empty. Initializing headers in '${resolvedExpensesTabName}'...`);
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
}

export const expenseTools = {
    add_expense: {
        name: "add_expense",
        description: "Append a new expense record to the 'Expenses' worksheet tab inside the 'astra_bot_expenses' Google Sheet.",
        parameters: {
            type: "object",
            properties: {
                amount: { type: "number", description: "Amount spent in NIS" },
                category: { type: "string", description: "Category (food, transport, shopping, etc)" },
                description: { type: "string", description: "Short description" }
            },
            required: ["amount", "category", "description"]
        },
        execute: async (args: any) => {
            try {
                const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
                addExpenseToDb(args.amount, args.category, args.description, date);

                const { id, tab } = await getOrInitializeExpenseSheet();
                const auth = await getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                await sheets.spreadsheets.values.append({
                    spreadsheetId: id,
                    range: `'${tab}'!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[date, args.description, args.amount, args.category]]
                    }
                });

                return { status: "success", message: `הוצאה ע"ס ${args.amount} ₪ נרשמה בגיליון.` };
            } catch (err: any) {
                return { status: "error", error: err.message };
            }
        }
    },
    get_expense_summary: {
        name: "get_expense_summary",
        description: "Summary of recent expenses.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", description: "'week' or 'month'" }
            }
        },
        execute: async (args: any) => {
            return getExpenseSummaryFromDb(args.period || 'week');
        }
    }
};
