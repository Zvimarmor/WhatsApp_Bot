import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/tasks'];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');

let cachedTasklistId: string | null = null;

async function getTasksClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
    return google.tasks({ version: 'v1', auth });
}

async function getTasklistId(): Promise<string> {
    if (cachedTasklistId) return cachedTasklistId;

    const client = await getTasksClient();
    try {
        const res = await client.tasklists.list({ maxResults: 1 });
        const lists = res.data.items || [];
        if (lists.length > 0 && lists[0].id) {
            cachedTasklistId = lists[0].id;
            console.log(`[Tasks] Resolved tasklist: "${lists[0].title}" (${cachedTasklistId})`);
            return cachedTasklistId;
        }
    } catch (err: any) {
        console.error('[Tasks] Failed to resolve tasklist, falling back to @default:', err.message);
    }
    return '@default';
}

export const taskTools = {
    list_pending_tasks: {
        name: "list_pending_tasks",
        description: "List today's pending Google Tasks.",
        parameters: {
            type: "object",
            properties: {
                maxResults: { type: "number", description: "Max tasks to return" }
            }
        },
        execute: async (args: any) => {
            const tasksClient = await getTasksClient();
            const tasklistId = await getTasklistId();
            const res = await tasksClient.tasks.list({
                tasklist: tasklistId,
                showCompleted: false,
                maxResults: args.maxResults || 20,
            });
            return { tasks: res.data.items || [] };
        }
    },
    complete_task: {
        name: "complete_task",
        description: "Mark a Google Task as completed by its ID.",
        parameters: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "ID of the task to complete" }
            },
            required: ["taskId"]
        },
        execute: async (args: any) => {
            const tasksClient = await getTasksClient();
            const tasklistId = await getTasklistId();

            try {
                const getRes = await tasksClient.tasks.get({
                    tasklist: tasklistId,
                    task: args.taskId
                });

                const task = getRes.data;
                task.status = 'completed';

                const updateRes = await tasksClient.tasks.update({
                    tasklist: tasklistId,
                    task: args.taskId,
                    requestBody: task
                });

                return { result: "success", task: updateRes.data };
            } catch (err: any) {
                console.error(`[Tasks] Failed to complete task ${args.taskId}:`, err.message);
                return { error: `Failed to complete task: ${err.message}` };
            }
        }
    },
    add_task: {
        name: "add_task",
        description: "Add a new task to Google Tasks.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Title of the task" },
                notes: { type: "string", description: "Optional notes/description" }
            },
            required: ["title"]
        },
        execute: async (args: any) => {
            const tasksClient = await getTasksClient();
            const tasklistId = await getTasklistId();
            const res = await tasksClient.tasks.insert({
                tasklist: tasklistId,
                requestBody: {
                    title: args.title,
                    notes: args.notes
                }
            });
            return { result: "success", task: res.data };
        }
    }
};
