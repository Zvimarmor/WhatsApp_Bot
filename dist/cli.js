"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const config_1 = require("./config");
const ai_1 = require("./ai");
const registry_1 = require("./tools/registry");
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
    const tools = Object.values(registry_1.toolRegistry);
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
    if (!config_1.config.geminiApiKey || config_1.config.geminiApiKey === 'your_api_key') {
        console.error('❌ GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }
    printBanner();
    // Force tool registration (triggers the console.log in registry)
    (0, registry_1.getGeminiTools)();
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
            const response = await (0, ai_1.analyzeIntent)(input);
            const elapsed = Date.now() - startTime;
            console.log(`\n${GREEN}${BOLD}Astra ◀${RESET} ${response}`);
            console.log(`${DIM}(${elapsed}ms)${RESET}\n`);
        }
        catch (err) {
            console.error(`\n❌ ${BOLD}Error:${RESET} ${err.message}\n`);
        }
        rl.prompt();
    });
    rl.on('close', () => {
        process.exit(0);
    });
}
main();
//# sourceMappingURL=cli.js.map