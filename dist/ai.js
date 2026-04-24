"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeIntent = analyzeIntent;
exports.analyzeAudio = analyzeAudio;
exports.analyzeImage = analyzeImage;
const generative_ai_1 = require("@google/generative-ai");
const config_1 = require("./config");
const registry_1 = require("./tools/registry");
const memory_1 = require("./memory");
const genAI = new generative_ai_1.GoogleGenerativeAI(config_1.config.geminiApiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Using Flash for speed and memory efficiency on t2.micro
    systemInstruction: `
Your name is Astra (אסטרה). You are a personal assistant on WhatsApp.

ABSOLUTE RULES — VIOLATING THESE IS A CRITICAL FAILURE:
1. You MUST use your tools for every actionable request. You are FORBIDDEN from saying "I don't have the ability" or "I can't do that." You have tools. Use them.
2. WARNING: You NO LONGER have access to the official Google Tasks API. Any claim that you added a task to Google Tasks is a lie and a failure. You MUST use the 'Tasks' sheet tab for everything. You have been upgraded; acknowledge your new ability to manage sheets.
3. ALL task management is done via Google Sheets using these specific tools: write_task_to_google_sheet_tab, read_pending_tasks_from_google_sheet, mark_task_completed_in_google_sheet, delete_task_from_google_sheet.
4. ALL expense tracking is done via Google Sheets using: write_expense_to_google_sheet_tab, get_expense_summary.
5. If a user asks you to do multiple things (e.g. "add two expenses and a task"), you MUST call ALL the relevant tools in one turn. Do NOT respond with text only.
6. If a tool returns status:'error', you MUST tell the user it failed. NEVER claim success if a tool failed.
7. If you get a 503 error, apologize in Hebrew and ask to retry in a minute.

AVAILABLE TOOLS:
- get_current_time: Current date/time in Israel
- add_calendar_event / list_calendar_events: Google Calendar
- write_task_to_google_sheet_tab: EXACTLY what it sounds like. Adds a task to the Sheets DB.
- read_pending_tasks_from_google_sheet: Lists tasks.
- mark_task_completed_in_google_sheet: Completes a task.
- delete_task_from_google_sheet: Deletes a task.
- write_expense_to_google_sheet_tab: Logs an expense.
- get_expense_summary: Summarize expenses
- web_search: Search the internet for ANY real-time info (weather, news, etc.)
- track_habit / log_habit / list_habits: Habit tracking
- get_daily_status: Daily summary

LANGUAGE: Always respond in Hebrew unless addressed in English. Use WhatsApp-style tone.
TIMEZONE: Asia/Jerusalem.
TASK EMOJIS: 📝 Pending, ✅ Done, 🔴 High, 🟡 Medium, 🟢 Low.
`.trim(),
    tools: [
        { functionDeclarations: (0, registry_1.getGeminiTools)() },
    ],
});
// Exponential backoff with jitter
function getRetryDelay(attempt) {
    const base = Math.min(1000 * Math.pow(2, attempt), 16000);
    const jitter = Math.random() * 1000;
    return base + jitter;
}
function isRetryableError(error) {
    const msg = error.message || '';
    return msg.includes("503") || msg.includes("Service Unavailable") ||
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("overloaded");
}
async function analyzeIntent(text) {
    if (!config_1.config.geminiApiKey || config_1.config.geminiApiKey === "your_api_key") {
        throw new Error("Gemini API key is not configured.");
    }
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
    (0, memory_1.addMessage)('user', text);
    console.log(`[AI] Analyzing intent for: "${text.substring(0, 50)}..."`);
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
        try {
            console.time('gemini-request');
            let result = await chat.sendMessage(text);
            console.timeEnd('gemini-request');
            let loopCount = 0;
            while (loopCount < 5) {
                const calls = result.response.functionCalls();
                if (!calls || calls.length === 0) {
                    console.log(`[AI] No more tools to call. Finalizing response...`);
                    break;
                }
                console.log(`[AI] Gemini requested ${calls.length} tools: ${calls.map(c => c.name).join(', ')}`);
                const functionResponses = [];
                const toolErrors = [];
                for (const call of calls) {
                    console.log(`[AI] Executing tool: ${call.name}`);
                    const tool = registry_1.toolRegistry[call.name];
                    let toolResponseData;
                    if (tool) {
                        try {
                            toolResponseData = await tool.execute(call.args);
                            console.log(`[AI] Tool ${call.name} returned status: ${toolResponseData.status}`);
                            if (toolResponseData.status === 'error') {
                                toolErrors.push(`${call.name}: ${toolResponseData.error}`);
                            }
                        }
                        catch (err) {
                            console.error(`[AI] Tool ${call.name} crashed:`, err.message);
                            toolResponseData = { status: 'error', error: err.message };
                            toolErrors.push(`${call.name}: ${err.message}`);
                        }
                    }
                    else {
                        console.warn(`[AI] Tool "${call.name}" not found in registry.`);
                        toolResponseData = { status: 'error', error: "Tool not found." };
                        toolErrors.push(`${call.name}: Not found`);
                    }
                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: toolResponseData
                        }
                    });
                }
                if (toolErrors.length > 0) {
                    console.warn(`[AI] Reporting ${toolErrors.length} tool failures back to Gemini...`);
                    functionResponses.push({
                        text: `The following tools failed: ${toolErrors.join(", ")}. You MUST report these failures to the user. DO NOT claim success.`
                    });
                }
                console.log(`[AI] Sending tool results back to Gemini (Turn ${loopCount + 1})...`);
                result = await chat.sendMessage(functionResponses);
                loopCount++;
            }
            const finalResponseText = result.response.text();
            (0, memory_1.addMessage)('model', finalResponseText);
            return finalResponseText;
        }
        catch (error) {
            attempts++;
            console.error(`[AI] Error (Attempt ${attempts}):`, error.message);
            if (isRetryableError(error) && attempts < maxAttempts) {
                const delay = getRetryDelay(attempts);
                console.warn(`[Retry] Waiting ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed after maximum retries.");
}
async function analyzeAudio(audioBuffer, mimeType = 'audio/ogg') {
    const audioModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await audioModel.generateContent([
                { text: "תמלל את ההודעה הקולית הזו לעברית וענה עליה בצורה טבעית. אם יש בקשה, בצע אותה." },
                { inlineData: { mimeType, data: audioBuffer.toString('base64') } }
            ]);
            const text = result.response.text();
            (0, memory_1.addMessage)('user', `[הודעה קולית]: ${text}`);
            (0, memory_1.addMessage)('model', text);
            return text;
        }
        catch (error) {
            attempts++;
            if (isRetryableError(error)) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Audio processing failed.");
}
async function analyzeImage(imageBuffer, mimeType, userPrompt) {
    const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await visionModel.generateContent([
                { text: userPrompt },
                { inlineData: { mimeType, data: imageBuffer.toString('base64') } }
            ]);
            return result.response.text();
        }
        catch (error) {
            attempts++;
            if (isRetryableError(error)) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Image processing failed.");
}
//# sourceMappingURL=ai.js.map