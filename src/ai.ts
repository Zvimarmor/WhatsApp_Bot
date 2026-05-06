import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";
import { getGeminiTools, toolRegistry } from "./tools/registry";
import { addMessage, getRecentHistory } from "./memory";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// ─── Cached Models (avoid re-instantiation per call) ─────────────────
const chatModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
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
- write_task_to_google_sheet_tab: Adds a task to the Sheets DB.
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
        { functionDeclarations: getGeminiTools() },
    ],
});

// Reuse a single model instance for audio and image (no tools needed)
const mediaModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ─── Retry Helpers ───────────────────────────────────────────────────

function getRetryDelay(attempt: number): number {
    const base = Math.min(1000 * Math.pow(2, attempt), 16000);
    return base + Math.random() * 1000;
}

function isRetryableError(error: any): boolean {
    const msg = error.message || '';
    return msg.includes("503") || msg.includes("Service Unavailable") ||
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("overloaded");
}

// ─── Main AI Entry Point ─────────────────────────────────────────────

let requestCounter = 0;

export async function analyzeIntent(text: string): Promise<string> {
    if (!config.geminiApiKey || config.geminiApiKey === "your_api_key") {
        throw new Error("Gemini API key is not configured.");
    }

    const historyRows = getRecentHistory(20);
    let history: { role: string, parts: { text: string }[] }[] = [];

    for (const row of historyRows) {
        if (history.length === 0 && row.role !== 'user') continue;
        const lastEntry = history[history.length - 1];
        if (lastEntry && lastEntry.role === row.role) continue;
        history.push({
            role: row.role as "user" | "model",
            parts: [{ text: row.content }]
        });
    }

    const chat = chatModel.startChat({ history });
    addMessage('user', text);

    const reqId = ++requestCounter;
    console.log(`[AI #${reqId}] Intent: "${text.substring(0, 50)}"`);

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            const t0 = Date.now();
            let result = await chat.sendMessage(text);
            console.log(`[AI #${reqId}] Gemini responded in ${Date.now() - t0}ms`);

            let loopCount = 0;
            while (loopCount < 5) {
                const calls = result.response.functionCalls();
                if (!calls || calls.length === 0) {
                    console.log(`[AI #${reqId}] Finalizing (no more tools)`);
                    break;
                }

                console.log(`[AI #${reqId}] Tools: ${calls.map(c => c.name).join(', ')}`);
                const functionResponses: any[] = [];
                const toolErrors: string[] = [];

                for (const call of calls) {
                    const tool = toolRegistry[call.name];
                    let toolResponseData: Record<string, any>;

                    if (tool) {
                        try {
                            console.log(`[AI #${reqId}] Exec: ${call.name}`);
                            toolResponseData = await tool.execute(call.args);
                            console.log(`[AI #${reqId}] ${call.name} → ${toolResponseData.status || 'ok'}`);
                            if (toolResponseData.status === 'error') {
                                toolErrors.push(`${call.name}: ${toolResponseData.error}`);
                            }
                        } catch (err: any) {
                            console.error(`[AI #${reqId}] ${call.name} crashed:`, err.message);
                            toolResponseData = { status: 'error', error: err.message };
                            toolErrors.push(`${call.name}: ${err.message}`);
                        }
                    } else {
                        console.warn(`[AI #${reqId}] Tool "${call.name}" NOT in registry`);
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
                    console.warn(`[AI #${reqId}] ${toolErrors.length} failures`);
                    functionResponses.push({
                        text: `The following tools failed: ${toolErrors.join(", ")}. You MUST report these failures to the user. DO NOT claim success.`
                    });
                }

                result = await chat.sendMessage(functionResponses);
                loopCount++;
            }

            const finalResponseText = result.response.text();
            addMessage('model', finalResponseText);
            return finalResponseText;

        } catch (error: any) {
            attempts++;
            console.error(`[AI #${reqId}] Attempt ${attempts} failed:`, error.message);
            if (isRetryableError(error) && attempts < maxAttempts) {
                const delay = getRetryDelay(attempts);
                console.warn(`[AI #${reqId}] Retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed after maximum retries.");
}

// ─── Multimodal: Audio ───────────────────────────────────────────────

export async function analyzeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await mediaModel.generateContent([
                { text: "תמלל את ההודעה הקולית הזו לעברית וענה עליה בצורה טבעית. אם יש בקשה, בצע אותה." },
                { inlineData: { mimeType, data: audioBuffer.toString('base64') } }
            ]);
            const text = result.response.text();
            addMessage('user', `[הודעה קולית]: ${text}`);
            addMessage('model', text);
            return text;
        } catch (error: any) {
            attempts++;
            if (isRetryableError(error) && attempts < 3) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Audio processing failed.");
}

// ─── Multimodal: Image ───────────────────────────────────────────────

export async function analyzeImage(imageBuffer: Buffer, mimeType: string, userPrompt: string): Promise<string> {
    let attempts = 0;
    while (attempts < 3) {
        try {
            const result = await mediaModel.generateContent([
                { text: userPrompt },
                { inlineData: { mimeType, data: imageBuffer.toString('base64') } }
            ]);
            return result.response.text();
        } catch (error: any) {
            attempts++;
            if (isRetryableError(error) && attempts < 3) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Image processing failed.");
}
