import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');
const TASKS_TAB = 'Tasks';

let cachedSheetId: string | null = null;
let resolvedTasksTabName: string | null = null;

function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

async function getSheetInfo(): Promise<{ id: string, tab: string }> {
    if (cachedSheetId && resolvedTasksTabName) return { id: cachedSheetId, tab: resolvedTasksTabName };

    const auth = getAuthClient();
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

    // 1. Look for 'Tasks'
    let targetTab = sheets_list.find(s => s.properties?.title === TASKS_TAB);

    // 2. Fallback to index 0
    if (!targetTab && sheets_list.length > 0) {
        targetTab = sheets_list[0];
        console.log(`[Tasks] '${TASKS_TAB}' tab not found, falling back to index 0: '${targetTab.properties?.title}'`);
    }

    if (!targetTab || !targetTab.properties?.title) {
        throw new Error("Sheet Tasks not found. Please ensure the tabs are named correctly.");
    }

    resolvedTasksTabName = targetTab.properties.title;
    console.log(`[Tasks] Using tab: '${resolvedTasksTabName}'`);

    // 3. Initialize headers ONLY if completely empty
    const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${resolvedTasksTabName}'!A1:Z100`,
    });

    if (!checkRes.data.values || checkRes.data.values.length === 0) {
        console.log(`[Tasks] Sheet is empty. Initializing headers in '${resolvedTasksTabName}'...`);
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${resolvedTasksTabName}'!A1:E1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['ID', 'Date', 'Task', 'Status', 'Priority']] }
        });
    }

    return { id: sheetId, tab: resolvedTasksTabName };
}

async function getNextTaskId(sheets: any, sheetId: string, tabName: string): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${tabName}'!A:A`,
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
        description: "Add task to Google Sheets.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string" },
                priority: { type: "string" }
            },
            required: ["title"]
        },
        execute: async (args: any) => {
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const taskId = await getNextTaskId(sheets, id, tab);
                const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
                const priority = args.priority || 'medium';

                await sheets.spreadsheets.values.append({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[taskId, date, args.title, 'Pending', priority]]
                    }
                });
                return { status: "success", taskId, message: `משימה ${taskId} נוספה.` };
            } catch (err: any) {
                return { status: "error", error: err.message };
            }
        }
    },
    list_tasks_from_sheet: {
        name: "list_tasks_from_sheet",
        description: "List tasks.",
        parameters: { type: "object", properties: {} },
        execute: async (args: any) => {
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                });
                const rows = res.data.values || [];
                const tasks = rows.slice(1).filter(r => (r[3] || '').toLowerCase() === 'pending').map(r => ({ id: r[0], date: r[1], title: r[2], status: r[3], priority: r[4] }));
                return { tasks };
            } catch (err: any) {
                return { status: "error", error: err.message };
            }
        }
    },
    complete_task_in_sheet: {
        name: "complete_task_in_sheet",
        description: "Complete task.",
        parameters: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
        execute: async (args: any) => {
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'!A:E` });
                const rows = res.data.values || [];
                const search = (args.taskId || '').toLowerCase();
                const idx = rows.findIndex((r, i) => i > 0 && (r[0].toLowerCase() === search || r[2].toLowerCase().includes(search)) && (r[3] || '').toLowerCase() === 'pending');
                if (idx === -1) return { status: "error", error: "משימה לא נמצאה" };
                await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${tab}'!D${idx + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['Completed']] } });
                return { status: "success", message: "המשימה הושלמה" };
            } catch (err: any) {
                return { status: "error", error: err.message };
            }
        }
    },
    delete_task: {
        name: "delete_task",
        description: "Delete task.",
        parameters: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
        execute: async (args: any) => {
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id });
                const sheetId = spreadsheet.data.sheets?.find(s => s.properties?.title === tab)?.properties?.sheetId;
                const tasksRes = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'!A:E` });
                const rows = tasksRes.data.values || [];
                const search = (args.taskId || '').toLowerCase();
                const idx = rows.findIndex((r, i) => i > 0 && (r[0].toLowerCase() === search || r[2].toLowerCase().includes(search)));
                if (idx === -1) return { status: "error", error: "משימה לא נמצאה" };
                await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] } });
                return { status: "success", message: "המשימה נמחקה" };
            } catch (err: any) {
                return { status: "error", error: err.message };
            }
        }
    }
};
