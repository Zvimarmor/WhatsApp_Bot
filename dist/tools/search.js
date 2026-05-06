"use strict";
// ─── Web Search & Weather Tool ──────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchTools = void 0;
// Weather keywords in Hebrew and English
const WEATHER_KEYWORDS = /weather|forecast|temperature|מזג\s*אוויר|תחזית|טמפרטורה|חום|קר|גשם/i;
const CITY_EXTRACT = /(?:weather|forecast|temperature|מזג\s*אוויר|תחזית)\s*(?:in|ב|של|עבור)?\s*(.+)/i;
// Common Hebrew→English city map for wttr.in
const CITY_MAP = {
    'ירושלים': 'Jerusalem',
    'תל אביב': 'Tel Aviv',
    'חיפה': 'Haifa',
    'באר שבע': 'Beer Sheva',
    'אילת': 'Eilat',
    'נתניה': 'Netanya',
    'הרצליה': 'Herzliya',
    'רמת גן': 'Ramat Gan',
    'פתח תקווה': 'Petah Tikva',
    'ראשון לציון': 'Rishon LeZion',
    'אשדוד': 'Ashdod',
    'לונדון': 'London',
    'ניו יורק': 'New York',
    'פריז': 'Paris',
};
function translateCity(raw) {
    const trimmed = raw.trim().replace(/[?.!,]/g, '');
    return CITY_MAP[trimmed] || trimmed;
}
exports.searchTools = {
    web_search: {
        name: "web_search",
        description: "Search the web for real-time info. IMPORTANT: Always translate Hebrew queries to English before calling. For weather, include the city name in English.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query — MUST be in English" }
            },
            required: ["query"]
        },
        execute: async (args) => {
            const query = args.query || '';
            console.log(`[Search] Query: "${query}"`);
            try {
                // 1. Weather detection
                if (WEATHER_KEYWORDS.test(query)) {
                    const cityMatch = query.match(CITY_EXTRACT);
                    const rawCity = cityMatch?.[1] || query.replace(WEATHER_KEYWORDS, '').trim();
                    const city = translateCity(rawCity);
                    console.log(`[Search] Weather detected for: "${city}"`);
                    return await fetchWeather(city);
                }
                // 2. Try DuckDuckGo lite search
                const searchResults = await duckDuckGoLiteSearch(query);
                if (searchResults.length > 0) {
                    return {
                        results: searchResults,
                        source: 'DuckDuckGo',
                        summary: searchResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n')
                    };
                }
                // 3. DuckDuckGo Instant Answer API
                const instantAnswer = await duckDuckGoInstant(query);
                if (instantAnswer)
                    return instantAnswer;
                // 4. Wikipedia fallback
                const wikiResult = await wikipediaSearch(query);
                if (wikiResult)
                    return wikiResult;
                return {
                    answer: "לא מצאתי תוצאות. נסה לנסח את השאלה אחרת.",
                    source: 'none'
                };
            }
            catch (err) {
                console.error('[Search] Failed:', err.message);
                return { status: 'error', error: err.message };
            }
        }
    }
};
// ─── Weather via wttr.in ─────────────────────────────────────────────
async function fetchWeather(city) {
    try {
        console.log(`[Weather] Fetching: wttr.in/${city}`);
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'curl/7.68.0' } // wttr.in responds best to curl UA
        });
        if (!res.ok) {
            return { answer: `לא הצלחתי למצוא מזג אוויר עבור "${city}".`, source: 'wttr.in' };
        }
        const data = await res.json();
        const current = data.current_condition?.[0];
        const today = data.weather?.[0];
        if (!current) {
            return { answer: `לא הצלחתי למצוא מזג אוויר עבור "${city}".`, source: 'wttr.in' };
        }
        return {
            source: 'wttr.in',
            city,
            current: {
                temp_c: current.temp_C,
                feels_like_c: current.FeelsLikeC,
                description: current.weatherDesc?.[0]?.value,
                humidity: current.humidity + '%',
                wind_kmph: current.windspeedKmph,
            },
            today: today ? {
                max_c: today.maxtempC,
                min_c: today.mintempC,
                sunrise: today.astronomy?.[0]?.sunrise,
                sunset: today.astronomy?.[0]?.sunset,
            } : null,
            summary: `${city}: ${current.temp_C}°C (מרגיש כמו ${current.FeelsLikeC}°C), ${current.weatherDesc?.[0]?.value}, לחות ${current.humidity}%`
        };
    }
    catch (err) {
        console.error('[Weather] Error:', err.message);
        return { answer: `שגיאה: ${err.message}`, source: 'wttr.in' };
    }
}
// ─── DuckDuckGo Lite Search ──────────────────────────────────────────
async function duckDuckGoLiteSearch(query) {
    try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        if (!res.ok) {
            console.log(`[Search] Lite DDG returned ${res.status}`);
            return [];
        }
        const html = await res.text();
        const results = [];
        // DuckDuckGo Lite uses a table layout with specific classes
        // Extract links and their surrounding text
        const linkPattern = /class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
        const snippetPattern = /class="result-snippet"[^>]*>([\s\S]*?)<\//g;
        const links = [];
        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            links.push({ url: match[1], title: match[2].trim() });
        }
        const snippets = [];
        while ((match = snippetPattern.exec(html)) !== null) {
            snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
        }
        // If the specific class parsing didn't work, try generic link extraction
        if (links.length === 0) {
            // Fallback: extract any links that look like results
            const genericPattern = /<a[^>]+rel="nofollow"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
            while ((match = genericPattern.exec(html)) !== null) {
                if (!match[1].includes('duckduckgo.com')) {
                    links.push({ url: match[1], title: match[2].trim() });
                }
            }
        }
        for (let i = 0; i < Math.min(links.length, 5); i++) {
            results.push({
                title: links[i].title,
                snippet: snippets[i] || '',
                url: links[i].url,
            });
        }
        console.log(`[Search] DDG Lite returned ${results.length} results`);
        return results;
    }
    catch (err) {
        console.error('[Search] DDG Lite error:', err.message);
        return [];
    }
}
// ─── DuckDuckGo Instant Answer ───────────────────────────────────────
async function duckDuckGoInstant(query) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url);
        const data = await res.json();
        const answer = data.AbstractText || data.Answer || '';
        if (answer) {
            return { answer, source: data.AbstractSource || 'DuckDuckGo' };
        }
        const topics = (data.RelatedTopics || []).slice(0, 5).map((t) => t.Text).filter(Boolean);
        if (topics.length > 0) {
            return { results: topics, source: 'DuckDuckGo' };
        }
        return null;
    }
    catch {
        return null;
    }
}
// ─── Wikipedia Fallback ──────────────────────────────────────────────
async function wikipediaSearch(query) {
    try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok)
            return null;
        const data = await res.json();
        if (data.extract) {
            return { answer: data.extract, source: 'Wikipedia' };
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=search.js.map