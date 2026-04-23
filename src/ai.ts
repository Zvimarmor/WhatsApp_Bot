import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";
import { getGeminiTools, toolRegistry } from "./tools/registry";
import { addMessage, getRecentHistory } from "./memory";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    systemInstruction: `
Your name is Astra. You are a proactive, highly intelligent, and multimodal personal assistant.

### CORE OPERATING RULES:
1. NO EXCUSES: Never say "I don't have access to information" or "I cannot search." You MUST use your tools (Search, Calendar, Sheets, Tasks) to fulfill every request.
2. INTEGRITY & HONESTY: Your reliability depends entirely on tool outputs. 
   - If a tool returns 'status: success', you may confirm the action.
   - If a tool returns 'status: error' or fails due to a 503/server error, you MUST report the failure to the user. 
   - NEVER claim an action was successful if the tool execution failed.
3. TIME & CONTEXT: You operate in the Asia/Jerusalem timezone (Israel). All dates and times must be handled accordingly.

### LANGUAGE & TONE:
- RESPONSE LANGUAGE: Always respond in Hebrew, unless the user addresses you in English.
- STYLE: Use a natural, concise, and friendly "WhatsApp-style" tone. Be helpful and grounded, like a witty peer.
- TASK FORMATTING: Use these emojis for task statuses:
  - 📝 Pending
  - ✅ Completed
  - 🔴 High Priority
  - 🟡 Medium Priority
  - 🟢 Low Priority

### TOOL PROTOCOLS:
- CALENDAR: Use 'add_calendar_event' and 'list_calendar_events'. Always verify time slots and prevent overlaps if possible.
- TASKS & EXPENSES: These are managed via Google Sheets (file: astra_bot_expenses).
  - Use 'add_expense' and 'get_expense_summary' for financial logs.
  - Use 'add_task_to_sheet', 'list_tasks_from_sheet', and 'complete_task_in_sheet' for the 'Tasks' worksheet tab.
- WEB SEARCH: Use 'web_search' for any real-time data, weather, news, or general knowledge questions you aren't 100% sure about.
- VOICE: You can receive and transcribe voice messages.

### HANDLING ERRORS:
- If a 503 error (Service Unavailable) occurs during a tool call, apologize sincerely in Hebrew and ask the user to try again in a minute due to server load.
`.trim(),
    tools: [
        { functionDeclarations: getGeminiTools() },
    ],
});

// Exponential backoff with jitter
function getRetryDelay(attempt: number): number {
    const base = Math.min(1000 * Math.pow(2, attempt), 16000);
    const jitter = Math.random() * 1000; // 0–1000ms random jitter
    return base + jitter;
}

function isRetryableError(error: any): boolean {
    const msg = error.message || '';
    return msg.includes("503") || msg.includes("Service Unavailable") ||
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("overloaded");
}

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

    const chat = model.startChat({ history });
    addMessage('user', text);
    console.log("Analyzing intent and generating response...");

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            let result = await chat.sendMessage(text);
            let loopCount = 0;
            while (loopCount < 5) {
                const calls = result.response.functionCalls();
                if (!calls || calls.length === 0) break;

                console.log(`[AI] Handling ${calls.length} tool calls...`);
                const functionResponses: any[] = [];
                const toolErrors: string[] = [];

                for (const call of calls) {
                    const tool = toolRegistry[call.name];
                    let toolResponseData: Record<string, any>;

                    if (tool) {
                        try {
                            toolResponseData = await tool.execute(call.args);
                            if (toolResponseData.status === 'error') {
                                toolErrors.push(`${call.name}: ${toolResponseData.error}`);
                            }
                        } catch (err: any) {
                            toolResponseData = { status: 'error', error: err.message };
                            toolErrors.push(`${call.name}: ${err.message}`);
                        }
                    } else {
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
            if (isRetryableError(error) && attempts < maxAttempts) {
                const delay = getRetryDelay(attempts);
                console.warn(`[Retry] Gemini error (attempt ${attempts}/${maxAttempts}). Waiting ${delay}ms... Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            console.error("Gemini API Error:", error.message);
            throw error;
        }
    }
    throw new Error("Failed after maximum retries.");
}

// Multimodal: analyze audio buffer
export async function analyzeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
    const audioModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const result = await audioModel.generateContent([
                { text: "תמלל את ההודעה הקולית הזו לעברית וענה עליה בצורה טבעית. אם יש בקשה, בצע אותה." },
                {
                    inlineData: {
                        mimeType,
                        data: audioBuffer.toString('base64')
                    }
                }
            ]);

            const text = result.response.text();
            addMessage('user', `[הודעה קולית]: ${text}`);
            addMessage('model', text);
            return text;
        } catch (error: any) {
            attempts++;
            if (isRetryableError(error) && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed to process audio.");
}

// Multimodal: analyze image (for receipt OCR)
export async function analyzeImage(imageBuffer: Buffer, mimeType: string, userPrompt: string): Promise<string> {
    const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const result = await visionModel.generateContent([
                { text: userPrompt },
                {
                    inlineData: {
                        mimeType,
                        data: imageBuffer.toString('base64')
                    }
                }
            ]);
            return result.response.text();
        } catch (error: any) {
            attempts++;
            if (isRetryableError(error) && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempts)));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed to process image.");
}
