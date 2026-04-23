import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');
const SPREADSHEET_ID = 'astra_bot_expenses';
const TASKS_TAB = 'Tasks';

let cachedSheetId: string | null = null;

function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'. Check if service_account.json is in the project root.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

// Strictly targets the 'Tasks' worksheet tab. Creates it if missing.
async function getOrInitializeTasksSheet(): Promise<string> {
    if (cachedSheetId) return cachedSheetId;

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        q: `name='${SPREADSHEET_ID}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id)',
    });

    const files = res.data.files;
    if (!files || files.length === 0 || !files[0].id) {
        throw new Error(`Spreadsheet '${SPREADSHEET_ID}' not found. Ensure it is shared with the service account email.`);
    }
    const sheetId = files[0].id;
    cachedSheetId = sheetId;

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheets_list = spreadsheet.data.sheets || [];

    // Find 'Tasks' tab
    const targetTab = sheets_list.find(s => s.properties?.title === TASKS_TAB);

    if (!targetTab) {
        console.log(`[Tasks] '${TASKS_TAB}' tab not found. Creating it immediately...`);
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
                requests: [{ addSheet: { properties: { title: TASKS_TAB } } }]
            }
        });
        
        console.log(`[Tasks] Initializing headers in '${TASKS_TAB}'...`);
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${TASKS_TAB}'!A1:E1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['ID', 'Date', 'Task', 'Status', 'Priority']] }
        });
    }

    return sheetId;
}

async function getNextTaskId(sheets: any, sheetId: string): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${TASKS_TAB}'!A:A`, // Explicitly hardcoded tab name to solve range errors
    });
    const rows = res.data.values || [];
    let maxNum = 0;
    for (const row of rows) {
        const match = (row[0] || '').toString().match(/^T(\d+)$/);
        if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
    }
    return `T${maxNum + 1}`;
}

export const taskTools = {
    add_task_to_sheet: {
        name: "add_task_to_sheet",
        description: "Add a new task record to the 'Tasks' worksheet tab inside the 'astra_bot_expenses' Google Sheet. Use this for ALL task management.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string" },
                priority: { type: "string", description: "high, medium, or low" }
            },
            required: ["title"]
        },
        execute: async (args: any) => {
            try {
                const id = await getOrInitializeTasksSheet();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const taskId = await getNextTaskId(sheets, id);
                const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
                const priority = args.priority || 'medium';

                await sheets.spreadsheets.values.append({
                    spreadsheetId: id,
                    range: `'${TASKS_TAB}'!A:E`, // Explicitly hardcoded
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[taskId, date, args.title, 'Pending', priority]]
                    }
                });
                return { status: "success", taskId, message: `משימה ${taskId} נוספה לגיליון.` };
            } catch (err: any) {
                console.error("[Tasks] Error adding task:", err);
                return { status: "error", error: err.message };
            }
        }
    },
    list_tasks_from_sheet: {
        name: "list_tasks_from_sheet",
        description: "Read all pending task records from the 'Tasks' worksheet tab inside the 'astra_bot_expenses' Google Sheet.",
        parameters: { type: "object", properties: {} },
        execute: async (args: any) => {
            try {
                const id = await getOrInitializeTasksSheet();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: id,
                    range: `'${TASKS_TAB}'!A:E`, // Explicitly hardcoded
                });
                const rows = res.data.values || [];
                const tasks = rows.slice(1).filter(r => (r[3] || '').toLowerCase() === 'pending').map(r => ({ id: r[0], date: r[1], title: r[2], status: r[3], priority: r[4] }));
                return { tasks };
            } catch (err: any) {
                console.error("[Tasks] Error listing tasks:", err);
                return { status: "error", error: err.message };
            }
        }
    },
    complete_task_in_sheet: {
        name: "complete_task_in_sheet",
        description: "Update a task record status to 'Completed' in the 'Tasks' worksheet tab inside the 'astra_bot_expenses' Google Sheet.",
        parameters: { type: "object", properties: { taskId: { type: "string", description: "The T-ID (e.g. T1) or part of the title" } }, required: ["taskId"] },
        execute: async (args: any) => {
            try {
                const id = await getOrInitializeTasksSheet();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${TASKS_TAB}'!A:E` }); // Explicitly hardcoded
                const rows = res.data.values || [];
                const search = (args.taskId || '').toLowerCase();
                const idx = rows.findIndex((r, i) => i > 0 && (r[0].toLowerCase() === search || r[2].toLowerCase().includes(search)) && (r[3] || '').toLowerCase() === 'pending');
                if (idx === -1) return { status: "error", error: "משימה לא נמצאה או שכבר הושלמה" };
                
                await sheets.spreadsheets.values.update({ 
                    spreadsheetId: id, 
                    range: `'${TASKS_TAB}'!D${idx + 1}`, // Explicitly hardcoded
                    valueInputOption: 'USER_ENTERED', 
                    requestBody: { values: [['Completed']] } 
                });
                return { status: "success", message: "המשימה סומנה כהושלמה בגיליון" };
            } catch (err: any) {
                console.error("[Tasks] Error completing task:", err);
                return { status: "error", error: err.message };
            }
        }
    },
    delete_task: {
        name: "delete_task",
        description: "Permanently delete a task row from the 'Tasks' worksheet tab inside the 'astra_bot_expenses' Google Sheet.",
        parameters: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
        execute: async (args: any) => {
            try {
                const id = await getOrInitializeTasksSheet();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                
                const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id });
                const sheetId = spreadsheet.data.sheets?.find(s => s.properties?.title === TASKS_TAB)?.properties?.sheetId;
                
                const tasksRes = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${TASKS_TAB}'!A:E` }); // Explicitly hardcoded
                const rows = tasksRes.data.values || [];
                const search = (args.taskId || '').toLowerCase();
                const idx = rows.findIndex((r, i) => i > 0 && (r[0].toLowerCase() === search || r[2].toLowerCase().includes(search)));
                if (idx === -1) return { status: "error", error: "משימה לא נמצאה" };
                
                await sheets.spreadsheets.batchUpdate({ 
                    spreadsheetId: id, 
                    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] } 
                });
                return { status: "success", message: "המשימה נמחקה מהגיליון" };
            } catch (err: any) {
                console.error("[Tasks] Error deleting task:", err);
                return { status: "error", error: err.message };
            }
        }
    }
};
