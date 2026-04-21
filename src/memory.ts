import Database from 'better-sqlite3';

const db = new Database('messages.db');

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        frequency TEXT NOT NULL,
        last_logged_date TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// === Messages ===

export function addMessage(role: 'user' | 'model', content: string) {
    try {
        const stmt = db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)');
        stmt.run(role, content);
    } catch (err: any) {
        console.error('[DB] Failed to save message:', err.message);
    }
}

export function getRecentHistory(limit: number = 20) {
    try {
        const stmt = db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT ?');
        const rows = stmt.all(limit) as { role: 'user' | 'model', content: string }[];
        return rows.reverse();
    } catch (err: any) {
        console.error('[DB] Failed to read history:', err.message);
        return [];
    }
}

// === Habits ===

export function addHabit(name: string, frequency: string) {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO habits (name, frequency) VALUES (?, ?)');
        stmt.run(name, frequency);
    } catch (err: any) {
        console.error('[DB] Failed to add habit:', err.message);
        throw err;
    }
}

export function logHabit(name: string) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    try {
        const stmt = db.prepare('UPDATE habits SET last_logged_date = ? WHERE name = ?');
        const info = stmt.run(today, name);
        if (info.changes === 0) {
            throw new Error(`Habit '${name}' not found.`);
        }
    } catch (err: any) {
        console.error('[DB] Failed to log habit:', err.message);
        throw err;
    }
}

export function getHabits() {
    try {
        const stmt = db.prepare('SELECT name, frequency, last_logged_date FROM habits');
        return stmt.all() as { name: string, frequency: string, last_logged_date: string | null }[];
    } catch (err: any) {
        console.error('[DB] Failed to list habits:', err.message);
        return [];
    }
}

// === Expenses ===

export function addExpenseToDb(amount: number, category: string, description: string, date: string) {
    try {
        const stmt = db.prepare('INSERT INTO expenses (amount, category, description, date) VALUES (?, ?, ?, ?)');
        stmt.run(amount, category, description, date);
    } catch (err: any) {
        console.error('[DB] Failed to add expense:', err.message);
        throw err;
    }
}

export function getExpenseSummaryFromDb(period: string = 'week') {
    try {
        const now = new Date();
        let since: string;

        if (period === 'month') {
            const d = new Date(now.getFullYear(), now.getMonth(), 1);
            since = d.toISOString().split('T')[0];
        } else {
            const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            since = d.toISOString().split('T')[0];
        }

        const stmt = db.prepare(`
            SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM expenses
            WHERE date >= ?
            GROUP BY category
            ORDER BY total DESC
        `);
        const rows = stmt.all(since) as { category: string, total: number, count: number }[];

        const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

        return {
            period,
            since,
            categories: rows,
            total: grandTotal,
            summary_hebrew: `סה"כ הוצאות (${period === 'month' ? 'חודשי' : 'שבועי'}): ${grandTotal} ₪`
        };
    } catch (err: any) {
        console.error('[DB] Failed to get expense summary:', err.message);
        return { error: err.message };
    }
}
