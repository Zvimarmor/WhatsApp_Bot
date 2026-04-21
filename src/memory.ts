import Database from 'better-sqlite3';

const db = new Database('messages.db');

// Enable WAL mode for concurrent read/write safety
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
`);

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

// === Habit Tracking ===

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
