import * as readline from 'readline';
import { config } from './config';
import { analyzeIntent } from './ai';
import { toolRegistry, getGeminiTools } from './tools/registry';

// ─── CLI Sandbox for Astra ───────────────────────────────────────────
// Bypasses WhatsApp entirely. Calls the AI engine directly.
// All tools (Sheets, Calendar, etc.) remain fully functional.
// Usage: node dist/cli.js

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function printBanner() {
    console.log(`
${CYAN}╔══════════════════════════════════════════╗
║       ${BOLD}⭐ ASTRA CLI SANDBOX v1.0${RESET}${CYAN}           ║
║  Type messages as if you're the owner.   ║
║  All tools are LIVE (Sheets, Calendar).  ║
║                                          ║
║  Commands:                               ║
║    /tools  — List registered tools       ║
║    /clear  — Clear chat history          ║
║    /mem    — Show memory usage           ║
║    /quit   — Exit                        ║
╚══════════════════════════════════════════╝${RESET}
`);
}

function printToolList() {
    const tools = Object.values(toolRegistry);
    console.log(`\n${YELLOW}${BOLD}Registered Tools (${tools.length}):${RESET}`);
    for (const t of tools) {
        console.log(`  ${GREEN}•${RESET} ${BOLD}${t.name}${RESET} ${DIM}— ${t.description.substring(0, 70)}${RESET}`);
    }
    console.log();
}

function printMemory() {
    const mem = process.memoryUsage();
    console.log(`\n${YELLOW}Memory Usage:${RESET}`);
    console.log(`  RSS:       ${Math.round(mem.rss / 1024 / 1024)} MB`);
    console.log(`  Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
    console.log(`  Heap Total:${Math.round(mem.heapTotal / 1024 / 1024)} MB`);
    console.log();
}

async function main() {
    // Validate config
    if (!config.geminiApiKey || config.geminiApiKey === 'your_api_key') {
        console.error('❌ GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }

    printBanner();

    // Force tool registration (triggers the console.log in registry)
    getGeminiTools();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${CYAN}You ▶${RESET} `,
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        // Handle commands
        if (input === '/quit' || input === '/exit') {
            console.log(`\n${DIM}Goodbye! 👋${RESET}`);
            rl.close();
            process.exit(0);
        }
        if (input === '/tools') {
            printToolList();
            rl.prompt();
            return;
        }
        if (input === '/clear') {
            console.log(`${DIM}(Chat history is in messages.db — delete it manually to fully reset)${RESET}\n`);
            rl.prompt();
            return;
        }
        if (input === '/mem') {
            printMemory();
            rl.prompt();
            return;
        }

        // Send to AI
        try {
            console.log(`${DIM}⏳ Thinking...${RESET}`);
            const startTime = Date.now();
            const response = await analyzeIntent(input);
            const elapsed = Date.now() - startTime;

            console.log(`\n${GREEN}${BOLD}Astra ◀${RESET} ${response}`);
            console.log(`${DIM}(${elapsed}ms)${RESET}\n`);
        } catch (err: any) {
            console.error(`\n❌ ${BOLD}Error:${RESET} ${err.message}\n`);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

main();
