# Astra - AI Personal WhatsApp Secretary

Astra is an autonomous AI assistant that lives in your WhatsApp messages. She acts as a personal secretary, managing your calendar, tasks, habits, and research.

## Features

- 📅 **Calendar Management**: List and create Google Calendar events.
- ✅ **Task Management**: Sync with Google Tasks.
- 🧘 **Habit Tracking**: Track daily habits via local SQLite database.
- 🧠 **Persistent Memory**: Remembers your previous conversations for context.
- 🛡️ **Self-Chat Only**: Strictly locked to your "Message Yourself" chat for privacy.

## Tech Stack

- **Reasoning**: Gemini 1.5 Flash (Google Generative AI)
- **Gateway**: [Baileys](https://github.com/adiwajshing/Baileys) (WhatsApp Web API)
- **Database**: Better-SQLite3
- **Language**: TypeScript

## Configuration

1. Copy `.env.example` to `.env` and fill in your keys.
2. Place your Google Cloud `service_account.json` in the root.
3. Share your Google Calendar with the service account email.

## Development

```bash
npm install
npm start
```

## Security

Secrets like `.env`, `service_account.json`, and the local database (`messages.db`) are automatically ignored by Git. Never commit these files.