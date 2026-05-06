import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { addExpenseToDb, getExpenseSummaryFromDb } from '../memory';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');
const SPREADSHEET_ID = 'astra_bot_expenses'; // We will search for this by name
const EXPENSES_TAB = 'Expenses';

let cachedSheetId: string | null = null;

function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

// Strictly targets the 'Expenses' worksheet tab. Creates it if missing.
async function getOrInitializeExpenseSheet(): Promise<string> {
    if (cachedSheetId) return cachedSheetId;

    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        q: `name='${SPREADSHEET_ID}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id)',
    });

    const files = res.data.files;
    if (!files || files.length === 0 || !files[0].id) {
        throw new Error(`Spreadsheet '${SPREADSHEET_ID}' not found.`);
    }
    const sheetId = files[0].id;
    cachedSheetId = sheetId;

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheets_list = spreadsheet.data.sheets || [];

    // Check if 'Expenses' tab exists
    const targetTab = sheets_list.find(s => s.properties?.title === EXPENSES_TAB);

    if (!targetTab) {
        console.log(`[Expenses] '${EXPENSES_TAB}' tab not found. Creating it immediately...`);
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
                requests: [{ addSheet: { properties: { title: EXPENSES_TAB } } }]
            }
        });

        // Initialize headers for the new tab
        console.log(`[Expenses] Initializing headers in '${EXPENSES_TAB}'...`);
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${EXPENSES_TAB}'!A1:D1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['Date', 'Description', 'Amount', 'Category']]
            }
        });
    }

    return sheetId;
}

export const expenseTools = {
    write_expense_to_google_sheet_tab: {
        name: "write_expense_to_google_sheet_tab",
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

                const id = await getOrInitializeExpenseSheet();
                const auth = await getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                await sheets.spreadsheets.values.append({
                    spreadsheetId: id,
                    range: `'${EXPENSES_TAB}'!A:D`, // Explicitly hardcoded tab name to solve range errors
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[date, args.description, args.amount, args.category]]
                    }
                });

                return { status: "success", message: `הוצאה ע"ס ${args.amount} ₪ נרשמה בגיליון.` };
            } catch (err: any) {
                console.error("[Expenses] Error adding expense:", err);
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
