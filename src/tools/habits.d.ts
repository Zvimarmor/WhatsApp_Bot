export declare const habitTools: {
    track_habit: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                name: {
                    type: string;
                    description: string;
                };
                frequency: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
        execute: (args: any) => Promise<{
            result: string;
        }>;
    };
    log_habit: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                name: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
        execute: (args: any) => Promise<{
            result: string;
        }>;
    };
    list_habits: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
        execute: (args: any) => Promise<{
            habits: {
                name: string;
                frequency: string;
                last_logged_date: string | null;
            }[];
        }>;
    };
};
//# sourceMappingURL=habits.d.ts.map