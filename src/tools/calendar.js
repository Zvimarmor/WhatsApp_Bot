"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarTools = void 0;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const KEY_PATH = path_1.default.join(process.cwd(), 'service_account.json');
async function getCalendarClient() {
    if (!fs_1.default.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'. Please follow the instructions to provide your Google API keys.");
    }
    try {
        const auth = new googleapis_1.google.auth.GoogleAuth({
            keyFile: KEY_PATH,
            scopes: SCOPES,
        });
        return googleapis_1.google.calendar({ version: 'v3', auth });
    }
    catch (err) {
        throw new Error("Invalid 'service_account.json'. Make sure you pasted the entire JSON content from Google Cloud.");
    }
}
exports.calendarTools = {
    list_calendar_events: {
        name: "list_calendar_events",
        description: "List upcoming events from the user's Google Calendar.",
        parameters: {
            type: "object",
            properties: {
                maxResults: { type: "number", description: "Number of events to return" }
            }
        },
        execute: async (args) => {
            const calendar = await getCalendarClient();
            const res = await calendar.events.list({
                calendarId: config_1.config.calendarId,
                timeMin: new Date().toISOString(),
                maxResults: args.maxResults || 10,
                singleEvents: true,
                orderBy: 'startTime',
            });
            return { events: res.data.items || [] };
        }
    },
    add_calendar_event: {
        name: "add_calendar_event",
        description: "Add a new event to the user's Google Calendar.",
        parameters: {
            type: "object",
            properties: {
                summary: { type: "string", description: "Title of the event" },
                location: { type: "string", description: "Location or meeting link" },
                description: { type: "string", description: "Notes for the event" },
                startDateTime: { type: "string", description: "ISO format start time (e.g. 2024-04-17T14:00:00Z)" },
                endDateTime: { type: "string", description: "ISO format end time" }
            },
            required: ["summary", "startDateTime", "endDateTime"]
        },
        execute: async (args) => {
            const calendar = await getCalendarClient();
            const res = await calendar.events.insert({
                calendarId: config_1.config.calendarId,
                requestBody: {
                    summary: args.summary,
                    location: args.location,
                    description: args.description,
                    start: { dateTime: args.startDateTime },
                    end: { dateTime: args.endDateTime },
                },
            });
            return { status: "success", event: res.data };
        }
    }
};
//# sourceMappingURL=calendar.js.map