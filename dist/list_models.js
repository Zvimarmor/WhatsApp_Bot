"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
async function main() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config_1.config.geminiApiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
        console.error("API Error:", data.error.message);
        return;
    }
    console.log("Available models supporting generateContent:\n");
    for (const m of data.models || []) {
        if (m.supportedGenerationMethods?.includes("generateContent")) {
            console.log(`  ✓ ${m.name}`);
        }
    }
}
main().catch(e => console.error("Error:", e.message));
//# sourceMappingURL=list_models.js.map