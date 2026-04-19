import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const KEY_PATH = path.join(process.cwd(), 'service_account.json');

async function getCalendarClient() {
    if (!fs.existsSync(KEY_PATH)) {
        throw new Error("Missing 'service_account.json'. Please follow the instructions to provide your Google API keys.");
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_PATH,
            scopes: SCOPES,
        });
        return google.calendar({ version: 'v3', auth });
    } catch (err) {
        throw new Error("Invalid 'service_account.json'. Make sure you pasted the entire JSON content from Google Cloud.");
    }
}

export const calendarTools = {
    list_calendar_events: {
        name: "list_calendar_events",
        description: "List upcoming events from the user's Google Calendar.",
        parameters: {
            type: "object",
            properties: {
                maxResults: { type: "number", description: "Number of events to return" }
            }
        },
        execute: async (args: any) => {
            const calendar = await getCalendarClient();
            const res = await calendar.events.list({
                calendarId: config.calendarId,
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
        execute: async (args: any) => {
            const calendar = await getCalendarClient();
            const res = await calendar.events.insert({
                calendarId: config.calendarId,
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
