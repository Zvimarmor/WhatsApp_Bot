"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeIntent = analyzeIntent;
const generative_ai_1 = require("@google/generative-ai");
const config_1 = require("./config");
const registry_1 = require("./tools/registry");
const memory_1 = require("./memory");
const genAI = new generative_ai_1.GoogleGenerativeAI(config_1.config.geminiApiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `You are Astra, an autonomous AI personal assistant. 
You primarily speak Hebrew, but can respond in English if spoken to in English.
Your goal is to be proactive, concise, and helpful.
You act as a personal secretary, financial manager, and research partner.
You have FULL access to the user's Google Calendar via built-in tools. Use them to manage meetings, zoom calls, and schedules proactively.
If a user asks a general knowledge question, answer it directly and conversationally.
Always respond in a natural, conversational way via WhatsApp.`,
    tools: [
        { functionDeclarations: (0, registry_1.getGeminiTools)() },
    ],
});
async function analyzeIntent(text) {
    if (!config_1.config.geminiApiKey || config_1.config.geminiApiKey === "your_api_key") {
        throw new Error("Gemini API key is not configured.");
    }
    // 1. Fetch recent memory and ensure it starts with 'user' and alternates roles
    const historyRows = (0, memory_1.getRecentHistory)(20);
    let history = [];
    for (const row of historyRows) {
        if (history.length === 0 && row.role !== 'user')
            continue;
        const lastEntry = history[history.length - 1];
        if (lastEntry && lastEntry.role === row.role)
            continue;
        history.push({
            role: row.role,
            parts: [{ text: row.content }]
        });
    }
    const chat = model.startChat({ history });
    // Store user message in DB
    (0, memory_1.addMessage)('user', text);
    console.log("Analyzing intent and generating response...");
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            let result = await chat.sendMessage(text);
            // 3. Handle tool calls if any
            let call = result.response.functionCalls()?.[0];
            // Loop to handle potential sequential tool calls
            let loopCount = 0;
            while (call && loopCount < 5) {
                console.log(`AI invoking tool: ${call.name} with args:`, call.args);
                const tool = registry_1.toolRegistry[call.name];
                let toolResponseData;
                if (tool) {
                    try {
                        toolResponseData = await tool.execute(call.args);
                    }
                    catch (err) {
                        console.error(`Tool execution error for ${call.name}:`, err);
                        toolResponseData = { error: err.message };
                    }
                }
                else {
                    console.error(`Tool ${call.name} called by Gemini but not found in registry.`);
                    toolResponseData = { error: "Tool not found locally." };
                }
                // Pass the execution result back to Gemini so it can answer the user
                result = await chat.sendMessage([{
                        functionResponse: {
                            name: call.name,
                            response: (typeof toolResponseData === 'object' && toolResponseData !== null) ? toolResponseData : { result: toolResponseData }
                        }
                    }]);
                call = result.response.functionCalls()?.[0];
                loopCount++;
            }
            const finalResponseText = result.response.text();
            // Store model response in DB
            (0, memory_1.addMessage)('model', finalResponseText);
            return finalResponseText;
        }
        catch (error) {
            attempts++;
            const isServiceUnavailable = error.message?.includes("503") || error.message?.includes("Service Unavailable");
            if (isServiceUnavailable && attempts < maxAttempts) {
                console.warn(`Gemini 503 error, attempt ${attempts}/${maxAttempts}. Retrying in 2s...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            console.error("Gemini API Error:", error);
            throw error;
        }
    }
    throw new Error("Failed to get response from Gemini after multiple attempts.");
}
//# sourceMappingURL=ai.js.map