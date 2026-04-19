export declare const dailyStatusTools: {
    get_daily_status: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
        execute: () => Promise<{
            status_hebrew: string;
            raw_tasks: import("googleapis").tasks_v1.Schema$Task[];
            uncompleted_habits: {
                name: string;
                frequency: string;
                last_logged_date: string | null;
            }[];
        }>;
    };
};
//# sourceMappingURL=daily_status.d.ts.map