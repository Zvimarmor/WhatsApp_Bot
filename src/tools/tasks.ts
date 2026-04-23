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

function getAuthClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
}

// Find the astra_bot_expenses spreadsheet and ensure "Tasks" tab exists
async function getSheetId(): Promise<string> {
    if (cachedSheetId) return cachedSheetId;

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
        q: "name='astra_bot_expenses' and mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name)',
    });

    const files = res.data.files;
    if (!files || files.length === 0 || !files[0].id) {
        throw new Error("Spreadsheet 'astra_bot_expenses' not found. Make sure it's shared with the service account.");
    }

    cachedSheetId = files[0].id;
    console.log(`[Tasks] Found spreadsheet: ${cachedSheetId}`);

    // Ensure the "Tasks" tab exists
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: cachedSheetId });
    const existingTabs = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    if (!existingTabs.includes(TASKS_TAB)) {
        console.log('[Tasks] Creating "Tasks" tab...');
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: cachedSheetId,
            requestBody: {
                requests: [{
                    addSheet: { properties: { title: TASKS_TAB } }
                }]
            }
        });
        // Write headers
        await sheets.spreadsheets.values.update({
            spreadsheetId: cachedSheetId,
            range: `${TASKS_TAB}!A1:E1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['ID', 'Date', 'Task', 'Status', 'Priority']] }
        });
        console.log('[Tasks] Tab initialized with headers.');
    } else {
        // Verify headers exist
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: cachedSheetId,
            range: `${TASKS_TAB}!A1:E1`,
        });
        if (!headerRes.data.values || headerRes.data.values.length === 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: cachedSheetId,
                range: `${TASKS_TAB}!A1:E1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [['ID', 'Date', 'Task', 'Status', 'Priority']] }
            });
        }
    }

    return cachedSheetId;
}

// Generate next task ID (T1, T2, T3...)
async function getNextTaskId(sheets: any, sheetId: string): Promise<string> {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${TASKS_TAB}!A:A`,
    });
    const rows = res.data.values || [];
    // Find the highest existing T-number
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
                const sheetId = await getSheetId();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const taskId = await getNextTaskId(sheets, sheetId);
                const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
                const priority = args.priority || 'medium';

                await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: `${TASKS_TAB}!A:E`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [[taskId, date, args.title, 'Pending', priority]]
                    }
                });

                console.log(`[Tasks] Added task ${taskId}: "${args.title}" (${priority})`);
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
        parameters: {
            type: "object",
            properties: {}
        },
        execute: async () => {
            console.log(`[Tasks] Listing pending tasks...`);
            try {
                const sheetId = await getSheetId();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: sheetId,
                    range: `${TASKS_TAB}!A:E`,
                });

                const rows = res.data.values || [];
                // Skip header row, filter only Pending tasks
                const tasks = rows.slice(1)
                    .filter(row => (row[3] || '').toLowerCase() === 'pending')
                    .map(row => ({
                        id: row[0],
                        date: row[1],
                        title: row[2],
                        status: row[3],
                        priority: row[4] || 'medium'
                    }));

                console.log(`[Tasks] Found ${tasks.length} pending tasks.`);
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
            console.log(`[Tasks] Completing task: "${searchTerm}"...`);
            try {
                const sheetId = await getSheetId();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: sheetId,
                    range: `${TASKS_TAB}!A:E`,
                });

                const rows = res.data.values || [];
                // Find matching row (by ID or by partial name match)
                let rowIndex = -1;
                for (let i = 1; i < rows.length; i++) {
                    const id = (rows[i][0] || '').toString().toLowerCase();
                    const title = (rows[i][2] || '').toString().toLowerCase();
                    const status = (rows[i][3] || '').toString().toLowerCase();
                    if (status !== 'pending') continue;

                    if (id === searchTerm.toLowerCase() || title.includes(searchTerm.toLowerCase())) {
                        rowIndex = i;
                        break;
                    }
                }

                if (rowIndex === -1) {
                    return { status: "error", error: `לא נמצאה משימה פעילה תואמת ל-"${searchTerm}"` };
                }

                // Update the status column (column D = index 3, row is 1-indexed in Sheets)
                const sheetRow = rowIndex + 1; // +1 because Sheets is 1-indexed
                await sheets.spreadsheets.values.update({
                    spreadsheetId: sheetId,
                    range: `${TASKS_TAB}!D${sheetRow}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [['Completed']] }
                });

                const taskName = rows[rowIndex][2];
                console.log(`[Tasks] Completed: ${rows[rowIndex][0]} - "${taskName}"`);
                return { status: "success", message: `✅ המשימה "${taskName}" סומנה כהושלמה!` };
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
            console.log(`[Tasks] Deleting task: "${searchTerm}"...`);
            try {
                const sheetId = await getSheetId();
                const auth = getAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });

                // Get the sheet's gid (sheetId for batchUpdate)
                const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
                const tasksSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === TASKS_TAB);
                if (!tasksSheet?.properties?.sheetId && tasksSheet?.properties?.sheetId !== 0) {
                    return { status: "error", error: "Tasks sheet not found." };
                }
                const tabSheetId = tasksSheet.properties.sheetId;

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: sheetId,
                    range: `${TASKS_TAB}!A:E`,
                });

                const rows = res.data.values || [];
                let rowIndex = -1;
                for (let i = 1; i < rows.length; i++) {
                    const id = (rows[i][0] || '').toString().toLowerCase();
                    const title = (rows[i][2] || '').toString().toLowerCase();
                    if (id === searchTerm.toLowerCase() || title.includes(searchTerm.toLowerCase())) {
                        rowIndex = i;
                        break;
                    }
                }

                if (rowIndex === -1) {
                    return { status: "error", error: `לא נמצאה משימה תואמת ל-"${searchTerm}"` };
                }

                const taskName = rows[rowIndex][2];

                // Delete the row using batchUpdate
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: tabSheetId,
                                    dimension: 'ROWS',
                                    startIndex: rowIndex,
                                    endIndex: rowIndex + 1
                                }
                            }
                        }]
                    }
                });

                console.log(`[Tasks] Deleted: "${taskName}"`);
                return { status: "success", message: `🗑️ המשימה "${taskName}" נמחקה.` };
            } catch (err: any) {
                console.error(`[Tasks] ERROR deleting task:`, err.message);
                return { status: "error", error: `Failed to delete task: ${err.message}` };
            }
        }
    }
};
