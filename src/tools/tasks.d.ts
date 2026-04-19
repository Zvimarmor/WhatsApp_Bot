import { tasks_v1 } from 'googleapis';
export declare const taskTools: {
    list_pending_tasks: {
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
            tasks: tasks_v1.Schema$Task[];
        }>;
    };
    complete_task: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                taskId: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
        execute: (args: any) => Promise<{
            result: string;
            task: tasks_v1.Schema$Task;
        }>;
    };
    add_task: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                title: {
                    type: string;
                    description: string;
                };
                notes: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
        execute: (args: any) => Promise<{
            result: string;
            task: tasks_v1.Schema$Task;
        }>;
    };
};
//# sourceMappingURL=tasks.d.ts.map