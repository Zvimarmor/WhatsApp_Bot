# Technical Implementation & Execution Plan

## 1. Tech Stack

- **Runtime:** Node.js (TypeScript preferred for stability).
- **WhatsApp Gateway:** `Baileys` (Unofficial Multi-Device API).
- **LLM Engine:** Gemini 1.5 Flash (API) - chosen for Vision, 1M+ Context, and Cost-efficiency.
- **Infrastructure:** AWS (EC2/Fargate) or GCP (Cloud Run).
- **Storage:** - Google Sheets API (Expenses/Habits).
  - Google Calendar/Tasks API.
  - SQLite (Local memory & state management).

## 2. System Architecture (Agentic Workflow)

The system must follow an **Agentic Loop**:

1. **Receiver:** Listen for WhatsApp events.
2. **Processor:** Gemini 1.5 Flash identifies intent (Tool Selection).
3. **Tool Registry:** - `calendar_tool`, `tasks_tool`, `sheets_tool`, `web_search_tool`, `memory_tool`.
4. **Executor:** Execute the logic and return a response.

## 3. Iterative Development & Self-Healing (For AI Coder)

**Claude Code / Gemini Instructions:**
You are required to follow a **Test-Driven Development (TDD)** approach for each module.

### Step-by-Step Cycle:

1. **Scaffold:** Setup the Node.js environment and `Baileys` connection.
2. **Implement & Debug:** - Write the module logic.
   - Run a `dry-run` test (mocking WhatsApp/Google APIs).
   - If an error occurs, analyze logs, refine the code, and re-run.
3. **Verification:**
   - Use a `test_suite.js` to simulate user messages and verify the expected Tool Call.

## 4. Testing & Validation Checklist

- [ ] **Auth Check:** Does the bot ignore messages from unknown numbers?
- [ ] **OCR Check:** Can it extract "Total" from a grocery receipt image?
- [ ] **Calendar Conflict:** Does it detect overlapping meetings?
- [ ] **Voice Check:** Does it correctly transcribe and act on Hebrew/English voice notes?
- [ ] **Persistence:** Does the bot reconnect automatically if the server restarts?

## 5. Deployment Instructions

- Containerize using **Docker**.
- Deploy to AWS/GCP with a persistent volume for the SQLite DB and WhatsApp session tokens.
