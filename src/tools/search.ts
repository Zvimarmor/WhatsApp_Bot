export const searchTools = {
    web_search: {
        name: "web_search",
        description: "Search the web for real-time information like weather, news, sports scores, or general queries. Use this when the user asks about current events or information you don't have.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "The search query in English (translate from Hebrew if needed)" }
            },
            required: ["query"]
        },
        execute: async (args: any) => {
            try {
                // DuckDuckGo Instant Answer API (free, no key required)
                const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`;
                const res = await fetch(url);
                const data = await res.json() as any;

                // Extract useful info
                const answer = data.AbstractText || data.Answer || '';
                const relatedTopics = (data.RelatedTopics || [])
                    .slice(0, 5)
                    .map((t: any) => t.Text)
                    .filter(Boolean);

                if (answer) {
                    return { answer, source: data.AbstractSource || 'DuckDuckGo' };
                }

                if (relatedTopics.length > 0) {
                    return { results: relatedTopics, source: 'DuckDuckGo' };
                }

                // Fallback: try Wikipedia API for factual queries
                const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(args.query)}`;
                const wikiRes = await fetch(wikiUrl);
                if (wikiRes.ok) {
                    const wikiData = await wikiRes.json() as any;
                    if (wikiData.extract) {
                        return { answer: wikiData.extract, source: 'Wikipedia' };
                    }
                }

                return { answer: "לא מצאתי תוצאות מדויקות. נסה לנסח אחרת.", source: 'none' };
            } catch (err: any) {
                console.error('[Search] Failed:', err.message);
                return { error: err.message };
            }
        }
    }
};
