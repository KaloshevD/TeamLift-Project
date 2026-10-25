
```bash
# 1. Database
docker compose up -d

# 2. Backend -> http://localhost:3000/api
cd backend
cp .env.example .env        
npm install
npm run start:dev

# 3. Frontend -> http://localhost:5173   (second terminal)
cd frontend
npm install
npm run dev
```

## AI extra: friendly confirmation message

Booking calls Gemini (Google AI Studio) to write a short confirmation. Put a key from https://aistudio.google.com/apikey in `backend/.env` as `GEMINI_API_KEY` and restart. `GEMINI_MODEL` can optionally select a model; it defaults to `gemini-3.5-flash-lite`. Without a key, or if Gemini fails, a plain template message is used, so booking never fails because of the LLM. For upstream errors, the backend logs the selected model and Google's error message when provided; a `503` usually indicates temporary service unavailability.

## Google Calendar extra: hide slots that clash with your events

When a calendar is connected, any slot overlapping a busy event is **hidden from bookers**, shown as "Busy in calendar" on the host page, and **rejected server-side** if someone tries to book it anyway (the calendar is re-checked at that moment, bypassing the cache).

### Setup (about 5 minutes)

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Calendar API**.
2. **OAuth consent screen:** choose *External*, fill in the basics, and add your own Google account under *Test users* (no verification needed while in testing mode).
3. **Credentials -> Create credentials -> OAuth client ID -> Web application.** Add this authorised redirect URI:
   `http://localhost:3000/api/google/callback`
4. Put the client ID and secret in `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and restart the backend.
5. Open `http://localhost:5173/#/host` and click **Connect**. Approve the consent screen, and you're back on the host page with the calendar connected.

Set `APP_TIMEZONE` (e.g. `Europe/Berlin`) in `.env` if your slots are not in the server's time zone.

### How it works and trade-offs

- **Bookings land on your calendar:** when someone books, an event "Meeting with <name>" is created on your primary calendar and the booker is invited by Google (so it also appears on their calendar). If this fails, the booking still succeeds.
- **Narrow permissions:** only `calendar.freebusy` (see *when* you're busy, never titles or details) and `calendar.events` (create events). The app never reads your existing events.
- **Upgrading from a read-only connection:** click **Reconnect** on the host page once to grant the event permission.
- **Free/busy API** is queried for the primary calendar for slots in the next 90 days, with results cached for 60 s so visitors polling the page don't hammer Google's API.
- **Fails open:** if Google is unreachable, slots stay available and a warning is logged, so an outage never blocks booking. If you revoke access in your Google account, the stored credential is dropped automatically.
- **Events that count as busy:** whatever Google reports as busy, which includes all-day events marked "Busy". Events set to "Free" are ignored.
- **No login (per the brief):** anyone who can open the host page can connect or disconnect the calendar. The refresh token is stored in the database in plain text. Both are fine for a demo; for production I'd add host auth and encrypt the token.
