# Project: "Astra" - AI Personal WhatsApp Secretary

## 1. Overview

Astra is an autonomous AI assistant operating via WhatsApp. It acts as a proactive personal secretary, financial manager, and research partner. The system integrates with Google Workspace and uses Gemini 1.5 Flash for reasoning, vision (OCR), and memory. Astra should both in Hebrew and English, but mostly in Hebrew.

## 2. Core Features

### A. Calendar & Task Management (Google Calendar/Tasks)

- **Functions:** Create, list, update, and delete events/tasks.
- **Proactive Reports:** - **Morning Brief:** (08:00 AM) Daily schedule and top priorities.
  - **Evening Summary:** (08:00 PM) Unfinished tasks and carry-over planning.

### B. Intelligent Financial Tracking (Google Sheets)

- **Expense Logging:** Parse text (e.g., "50 NIS on coffee") or images (Receipt OCR) to log expenses.
- **Categorization:** Auto-categorize spending (Food, Health, Travel).
- **Monthly Report:** Detailed summary sent on the 1st of every month.

### C. Habit Tracking (Dynamic)

- **Management:** Commands to add ("New habit: drink water") or remove habits.
- **Accountability:** Daily pings to check progress if not reported manually.

### D. Knowledge & Utility

- **Voice-to-Action:** Support for voice messages via Whisper/Gemini transcription.
- **Link/PDF Summarizer:** Send a URL or PDF for a concise 5-point summary.
- **Web Search:** Real-time information retrieval for weather, news, or general queries.
- **Research Mode:** Structured brainstorming for neuroscientific/computational ideas.

### E. Personal Long-Term Memory

- **The Vault:** Store and retrieve personal facts (e.g., "Where did I put my passport?") using a local SQLite/JSON store.

---

## 3. User Experience (WhatsApp Flow)

1. **User Sends Input:** (Text, Voice, Image, PDF, Link).
2. **AI Analysis:** Classify intent and decide which tool to call.
3. **Execution:** API call to Google, Web, or Memory.
4. **Response:** Natural language confirmation via WhatsApp.

## 4. Constraints & Security

- **Strictly Personal:** Only respond to the owner's phone number.
- **Data Privacy:** Financial and personal data must be stored in the owner's Google account or local DB.
