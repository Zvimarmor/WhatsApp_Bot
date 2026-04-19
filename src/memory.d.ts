export declare function addMessage(role: 'user' | 'model', content: string): void;
export declare function getRecentHistory(limit?: number): {
    role: "user" | "model";
    content: string;
}[];
export declare function addHabit(name: string, frequency: string): void;
export declare function logHabit(name: string): void;
export declare function getHabits(): {
    name: string;
    frequency: string;
    last_logged_date: string | null;
}[];
//# sourceMappingURL=memory.d.ts.map