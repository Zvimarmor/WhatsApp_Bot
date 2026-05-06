import { config } from "./config";

async function main() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    
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
