"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMessage = addMessage;
exports.getRecentHistory = getRecentHistory;
exports.addHabit = addHabit;
exports.logHabit = logHabit;
exports.getHabits = getHabits;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const db = new better_sqlite3_1.default('messages.db');
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
function addMessage(role, content) {
    const stmt = db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)');
    stmt.run(role, content);
}
function getRecentHistory(limit = 20) {
    const stmt = db.prepare('SELECT role, content FROM messages ORDER BY id DESC LIMIT ?');
    const rows = stmt.all(limit);
    // Return in chronological order
    return rows.reverse();
}
// === Habit Tracking ===
function addHabit(name, frequency) {
    const stmt = db.prepare('INSERT OR REPLACE INTO habits (name, frequency) VALUES (?, ?)');
    stmt.run(name, frequency);
}
function logHabit(name) {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare('UPDATE habits SET last_logged_date = ? WHERE name = ?');
    const info = stmt.run(today, name);
    if (info.changes === 0) {
        throw new Error(`Habit '${name}' not found.`);
    }
}
function getHabits() {
    const stmt = db.prepare('SELECT name, frequency, last_logged_date FROM habits');
    return stmt.all();
}
//# sourceMappingURL=memory.js.map