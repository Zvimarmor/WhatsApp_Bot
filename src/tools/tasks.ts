import { google, tasks_v1 } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/tasks'];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');

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
            const res = await tasksClient.tasks.list({
                tasklist: '@default',
                showCompleted: false,
                maxResults: args.maxResults || 20,
            });
            return { tasks: res.data.items || [] };
        }
    },
    complete_task: {
        name: "complete_task",
        description: "Mark a Google Task as completed.",
        parameters: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "ID of the task to complete" }
            },
            required: ["taskId"]
        },
        execute: async (args: any) => {
            const tasksClient = await getTasksClient();

            // First get the task
            const getRes = await tasksClient.tasks.get({
                tasklist: '@default',
                task: args.taskId
            });

            const task = getRes.data;
            task.status = 'completed';

            // Update it
            const updateRes = await tasksClient.tasks.update({
                tasklist: '@default',
                task: args.taskId,
                requestBody: task
            });

            return { result: "success", task: updateRes.data };
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
            const res = await tasksClient.tasks.insert({
                tasklist: '@default',
                requestBody: {
                    title: args.title,
                    notes: args.notes
                }
            });
            return { result: "success", task: res.data };
        }
    }
};
