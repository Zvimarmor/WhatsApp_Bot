"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarTools = void 0;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const KEY_PATH = path_1.default.join(process.cwd(), 'service_account.json');
const TIMEZONE = 'Asia/Jerusalem';
const CALENDAR_ID = 'fe05fa4349118c13c0544ea34b399cb2d15ee25be0faf840ea9da1192e67ff43@group.calendar.google.com';
async function getCalendarClient() {
    if (!fs_1.default.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'.");
    }
    const auth = new googleapis_1.google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: SCOPES,
    });
    return googleapis_1.google.calendar({ version: 'v3', auth });
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
                calendarId: CALENDAR_ID,
                timeMin: new Date().toISOString(),
                timeZone: TIMEZONE,
                maxResults: args.maxResults || 10,
                singleEvents: true,
                orderBy: 'startTime',
            });
            return { events: res.data.items || [] };
        }
    },
    add_calendar_event: {
        name: "add_calendar_event",
        description: "Add a new event to the user's Google Calendar. Times should be in ISO format.",
        parameters: {
            type: "object",
            properties: {
                summary: { type: "string", description: "Title of the event" },
                location: { type: "string", description: "Location or meeting link" },
                description: { type: "string", description: "Notes for the event" },
                startDateTime: { type: "string", description: "ISO start time, e.g. 2026-04-21T14:00:00" },
                endDateTime: { type: "string", description: "ISO end time, e.g. 2026-04-21T15:00:00" }
            },
            required: ["summary", "startDateTime", "endDateTime"]
        },
        execute: async (args) => {
            const calendar = await getCalendarClient();
            // Validate that required arguments are strings and not objects
            if (typeof args.summary !== 'string' || typeof args.startDateTime !== 'string' || typeof args.endDateTime !== 'string') {
                return { status: "error", error: "Invalid argument format. Summary, startDateTime, and endDateTime must be strings." };
            }
            try {
                const res = await calendar.events.insert({
                    calendarId: CALENDAR_ID,
                    requestBody: {
                        summary: args.summary,
                        location: args.location,
                        description: args.description,
                        start: { dateTime: args.startDateTime, timeZone: TIMEZONE },
                        end: { dateTime: args.endDateTime, timeZone: TIMEZONE },
                    },
                });
                console.log(`[Calendar] Successfully added event: "${args.summary}" at ${args.startDateTime}`);
                return { status: "success", event: res.data };
            }
            catch (err) {
                console.error(`[Calendar] Failed to add event "${args.summary}":`, err.message);
                return { status: "error", error: err.message };
            }
        }
    }
};
//# sourceMappingURL=calendar.js.map