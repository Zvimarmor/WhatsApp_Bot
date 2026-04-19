import Database from 'better-sqlite3';

const db = new Database('messages.db');

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
    const stmt = db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)');
    stmt.run(role, content);
}

export function getRecentHistory(limit: number = 20) {
    const stmt = db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT ?');
    const rows = stmt.all(limit) as { role: 'user' | 'model', content: string }[];
    // Return in chronological order
    return rows.reverse();
}

// === Habit Tracking ===

export function addHabit(name: string, frequency: string) {
    const stmt = db.prepare('INSERT OR REPLACE INTO habits (name, frequency) VALUES (?, ?)');
    stmt.run(name, frequency);
}

export function logHabit(name: string) {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare('UPDATE habits SET last_logged_date = ? WHERE name = ?');
    const info = stmt.run(today, name);
    if (info.changes === 0) {
        throw new Error(`Habit '${name}' not found.`);
    }
}

export function getHabits() {
    const stmt = db.prepare('SELECT name, frequency, last_logged_date FROM habits');
    return stmt.all() as { name: string, frequency: string, last_logged_date: string | null }[];
}
