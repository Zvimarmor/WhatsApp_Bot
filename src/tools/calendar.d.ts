export declare const calendarTools: {
    list_calendar_events: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                maxResults: {
                    type: string;
                    description: string;
                };
            };
        };
        execute: (args: any) => Promise<{
            events: import("googleapis").calendar_v3.Schema$Event[];
        }>;
    };
    add_calendar_event: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                summary: {
                    type: string;
                    description: string;
                };
                location: {
                    type: string;
                    description: string;
                };
                description: {
                    type: string;
                    description: string;
                };
                startDateTime: {
                    type: string;
                    description: string;
                };
                endDateTime: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
        execute: (args: any) => Promise<{
            status: string;
            event: import("googleapis").calendar_v3.Schema$Event;
        }>;
    };
};
//# sourceMappingURL=calendar.d.ts.map