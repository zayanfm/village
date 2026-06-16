import './loadEnv';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'calendar-service', ok: true }));

// ── Events (stub, in-memory) ─────────────────────────────────────────────────
// In-memory store so the worker can add events without the Postgres calendardb
// being wired. Persisted worker schedules / event blocks land here later; the
// route contract stays the same.
type CalendarEvent = { id: string; title: string; start: string; durationMin: number };

const events: CalendarEvent[] = [
  { id: 'evt-1', title: 'Check-in: Hana M.', start: '2026-06-17T10:00:00Z', durationMin: 45 },
  { id: 'evt-2', title: 'Group session', start: '2026-06-18T14:00:00Z', durationMin: 60 },
];
let seq = events.length;

app.get('/events', (_req, res) => {
  res.json({ events });
});

app.post('/events', (req, res) => {
  const { title, start, durationMin } = req.body ?? {};
  if (!title || !start) {
    return res.status(400).json({ error: 'title and start are required' });
  }
  const event: CalendarEvent = {
    id: `evt-${++seq}`,
    title: String(title),
    start: String(start),
    durationMin: Number(durationMin) > 0 ? Number(durationMin) : 30,
  };
  events.push(event);
  res.status(201).json(event);
});

const port = Number(process.env.PORT) || 4005;
app.listen(port, () => console.log(`[calendar-service] listening on :${port}`));
