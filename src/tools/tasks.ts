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

// Find the astra_bot_expenses spreadsheet and identify the Tasks tab dynamically
async function getSheetInfo(): Promise<{ id: string, tab: string }> {
    if (cachedSheetId && resolvedTasksTabName) return { id: cachedSheetId, tab: resolvedTasksTabName };

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        q: "name='astra_bot_expenses' and mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name)',
    });

    const files = res.data.files;
    if (!files || files.length === 0 || !files[0].id) {
        throw new Error("Spreadsheet 'astra_bot_expenses' not found.");
    }

    cachedSheetId = files[0].id;
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: cachedSheetId });
    const sheets_list = spreadsheet.data.sheets || [];

    // 1. Look for 'Tasks'
    let targetTab = sheets_list.find(s => s.properties?.title === TASKS_TAB);

    if (!targetTab) {
        // 2. If not found and only one sheet exists, use it (could be Sheet1 or Expenses)
        // Note: if Expenses.ts already ran and renamed/used the first sheet, we might want to check its content
        // But per instructions: if it doesn't exist, create it unless empty.
        // Actually, if many sheets exist and none is Tasks, we MUST create Tasks.
        if (sheets_list.length === 1 && sheets_list[0].properties?.title !== 'Expenses') {
            targetTab = sheets_list[0];
            console.log(`[Tasks] No 'Tasks' tab found, using the only sheet: '${targetTab.properties?.title}'`);
        } else {
            console.log(`[Tasks] Creating '${TASKS_TAB}' tab...`);
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: cachedSheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: TASKS_TAB } } }]
                }
            });
            resolvedTasksTabName = TASKS_TAB;
        }
    }

    if (targetTab && !resolvedTasksTabName) {
        resolvedTasksTabName = targetTab.properties?.title || TASKS_TAB;
    }

    console.log(`[Tasks] Target Tab identified as: '${resolvedTasksTabName}'`);

    // Ensure headers exist
    const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: cachedSheetId,
        range: `'${resolvedTasksTabName}'!A1:E1`,
    });

    if (!headerRes.data.values || headerRes.data.values.length === 0) {
        console.log(`[Tasks] Initializing headers in '${resolvedTasksTabName}'...`);
        await sheets.spreadsheets.values.update({
            spreadsheetId: cachedSheetId,
            range: `'${resolvedTasksTabName}'!A1:E1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['ID', 'Date', 'Task', 'Status', 'Priority']] }
        });
    }

    return { id: cachedSheetId, tab: resolvedTasksTabName! };
}

// Generate next task ID (T1, T2, T3...)
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
    add_task: {
        name: "add_task",
        description: "Add a new task to the user's task list. Priority can be: high, medium, low.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Title/description of the task" },
                priority: { type: "string", description: "Priority level: high, medium, or low (default: medium)" }
            },
            required: ["title"]
        },
        execute: async (args: any) => {
            console.log(`[Tasks] Adding task: "${args.title}"...`);
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const taskId = await getNextTaskId(sheets, id, tab);
                const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
                const priority = args.priority || 'medium';

                console.log(`[Tasks] Appending to range: '${tab}'!A:E`);
                await sheets.spreadsheets.values.append({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[taskId, date, args.title, 'Pending', priority]]
                    }
                });

                return { status: "success", taskId, message: `משימה ${taskId} נוספה: "${args.title}" (עדיפות: ${priority})` };
            } catch (err: any) {
                console.error(`[Tasks] ERROR adding task:`, err.message);
                return { status: "error", error: `Failed to add task: ${err.message}` };
            }
        }
    },

    list_pending_tasks: {
        name: "list_pending_tasks",
        description: "List all pending (incomplete) tasks.",
        parameters: { type: "object", properties: {} },
        execute: async () => {
            console.log(`[Tasks] Listing pending tasks...`);
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                });

                const rows = res.data.values || [];
                const tasks = rows.slice(1)
                    .filter(row => (row[3] || '').toLowerCase() === 'pending')
                    .map(row => ({
                        id: row[0],
                        date: row[1],
                        title: row[2],
                        status: row[3],
                        priority: row[4] || 'medium'
                    }));

                return { tasks };
            } catch (err: any) {
                console.error(`[Tasks] ERROR listing tasks:`, err.message);
                return { status: "error", error: `Failed to list tasks: ${err.message}` };
            }
        }
    },

    complete_task: {
        name: "complete_task",
        description: "Mark a task as completed by its ID (e.g. T1, T2) or by its name.",
        parameters: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "Task ID (e.g. T1) or task name to mark as completed" }
            },
            required: ["taskId"]
        },
        execute: async (args: any) => {
            const searchTerm = (args.taskId || '').trim();
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                });

                const rows = res.data.values || [];
                let rowIndex = -1;
                for (let i = 1; i < rows.length; i++) {
                    const taskId = (rows[i][0] || '').toString().toLowerCase();
                    const title = (rows[i][2] || '').toString().toLowerCase();
                    const status = (rows[i][3] || '').toString().toLowerCase();
                    if (status !== 'pending') continue;

                    if (taskId === searchTerm.toLowerCase() || title.includes(searchTerm.toLowerCase())) {
                        rowIndex = i;
                        break;
                    }
                }

                if (rowIndex === -1) {
                    return { status: "error", error: `לא נמצאה משימה פעילה תואמת ל-"${searchTerm}"` };
                }

                await sheets.spreadsheets.values.update({
                    spreadsheetId: id,
                    range: `'${tab}'!D${rowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [['Completed']] }
                });

                return { status: "success", message: `✅ המשימה "${rows[rowIndex][2]}" הושלמה!` };
            } catch (err: any) {
                console.error(`[Tasks] ERROR completing task:`, err.message);
                return { status: "error", error: `Failed to complete task: ${err.message}` };
            }
        }
    },

    delete_task: {
        name: "delete_task",
        description: "Delete a task entirely by its ID (e.g. T1) or by its name.",
        parameters: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "Task ID (e.g. T1) or task name to delete" }
            },
            required: ["taskId"]
        },
        execute: async (args: any) => {
            const searchTerm = (args.taskId || '').trim();
            try {
                const { id, tab } = await getSheetInfo();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id });
                const tasksSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === tab);
                const tabSheetId = tasksSheet?.properties?.sheetId;

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: id,
                    range: `'${tab}'!A:E`,
                });

                const rows = res.data.values || [];
                let rowIndex = -1;
                for (let i = 1; i < rows.length; i++) {
                    const taskId = (rows[i][0] || '').toString().toLowerCase();
                    const title = (rows[i][2] || '').toString().toLowerCase();
                    if (taskId === searchTerm.toLowerCase() || title.includes(searchTerm.toLowerCase())) {
                        rowIndex = i;
                        break;
                    }
                }

                if (rowIndex === -1) {
                    return { status: "error", error: `לא נמצאה משימה תואמת ל-"${searchTerm}"` };
                }

                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: id,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: { sheetId: tabSheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
                            }
                        }]
                    }
                });

                return { status: "success", message: `🗑️ המשימה "${rows[rowIndex][2]}" נמחקה.` };
            } catch (err: any) {
                console.error(`[Tasks] ERROR deleting task:`, err.message);
                return { status: "error", error: `Failed to delete task: ${err.message}` };
            }
        }
    }
};
