import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";
import { getGeminiTools, toolRegistry } from "./tools/registry";
import { addMessage, getRecentHistory } from "./memory";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `אתה אסטרה, עוזרת אישית אוטונומית שחיה בוואטסאפ.
אתה מדבר בעברית תמיד, אלא אם פונים אליך באנגלית.
אתה משמש כמזכירה אישית, מנהל משימות, מעקב הרגלים, וחוקר.

הכלים שלך:
- 📅 יומן: צפייה והוספת אירועים ביומן Google.
- ✅ משימות: ניהול Google Tasks (הוספה, סיום, רשימה).
- 🧘 הרגלים: מעקב הרגלים יומי (הוספה, רישום, רשימה).
- 📊 סטטוס יומי: סיכום כל המשימות וההרגלים שנותרו להיום.
- 🔍 חיפוש: חיפוש מידע באינטרנט בזמן אמת (מזג אוויר, חדשות, שאלות כלליות).
- 💰 הוצאות: רישום הוצאה (סכום + קטגוריה) בגוגל שיטס, וסיכום שבועי/חודשי.
- 🎤 קול: אתה יכול לקבל הודעות קוליות ולהבין אותן.
- 🕐 שעון: הצגת התאריך והשעה הנוכחיים בישראל.

כללים:
1. תמיד ענה בעברית, בטון טבעי ותמציתי כמו בוואטסאפ.
2. אם המשתמש שואל שאלה כללית, ענה ישירות ללא כלים.
3. השתמש בכלים רק כשצריך מידע חיצוני או פעולה.
4. כשאתה מציג רשימה, השתמש באימוג'ים ומספור.
5. כשמשתמש מדווח על הוצאה, השתמש בכלי log_expense לרשום אותה.`,
    tools: [
        { functionDeclarations: getGeminiTools() },
    ],
});

// Exponential backoff helper
function getRetryDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 16000); // 1s, 2s, 4s, 8s, 16s max
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
    const audioModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
    const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
