import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";
import { getGeminiTools, toolRegistry } from "./tools/registry";
import { addMessage, getRecentHistory } from "./memory";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    systemInstruction: `שמך אסטרה (Astra). את עוזרת אישית חכמה עם יכולות מולטי-מודאליות.
חוק בל יעבור: אל תגידי 'אין לי גישה למידע' או 'אני לא יכולה לחפש'. יש לך כלי חיפוש (Google Search/DuckDuckGo), יומן, משימות ומעקב הוצאות. השתמשי בהם תמיד כדי לענות על שאלות על מזג אוויר, חדשות, או כל בקשה אחרת.
את נמצאת באזור הזמן Asia/Jerusalem (ישראל). כל התאריכים והשעות בהקשר ישראלי.
את מדברת בעברית תמיד, אלא אם פונים אליך באנגלית.

הכלים שלך:
- 📅 יומן: צפייה והוספת אירועים (list_calendar_events, add_calendar_event).
- ✅ משימות: ניהול Google Tasks (list_pending_tasks, add_task, complete_task).
- 🧘 הרגלים: מעקב יומי (track_habit, log_habit, list_habits).
- 📊 סטטוס: סיכום כל המשימות וההרגלים (get_daily_status).
- 🔍 חיפוש: חיפוש מידע באינטרנט בזמן אמת (web_search).
- 💰 הוצאות: רישום הוצאה ב-Sheets (add_expense) וסיכום (get_expense_summary).
- 🎤 קול: קבלת הודעות קוליות ותמלולן.
- 🕐 שעון: תאריך ושעה (get_current_time).

כללים:
1. תמיד עני בעברית, בטון טבעי ותמציתי כמו בוואטסאפ.
2. אם שואלים שאלת ידע כללי שאת בטוחה בתשובה — עני ישירות.
3. אם שואלים על מזג אוויר, חדשות, מידע עדכני — השתמשי בכלי החיפוש.
4. כשמשתמש מדווח על הוצאה — השתמשי ב-add_expense.
5. כשאת מציגה רשימה — השתמשי באימוג'ים ומספור.
6. תמיד תצייתי לבקשות שמצריכות פעולה ואל תסרבי לחפש מידע חיצוני.`,
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
            let call = result.response.functionCalls()?.[0];

            let loopCount = 0;
            while (call && loopCount < 5) {
                console.log(`AI invoking tool: ${call.name} with args:`, call.args);
                const tool = toolRegistry[call.name];

                let toolResponseData: Record<string, any>;
                if (tool) {
                    try {
                        toolResponseData = await tool.execute(call.args);
                    } catch (err: any) {
                        console.error(`Tool execution error for ${call.name}:`, err.message);
                        toolResponseData = { error: err.message };
                    }
                } else {
                    console.error(`Tool ${call.name} not found in registry.`);
                    toolResponseData = { error: "Tool not found." };
                }

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
