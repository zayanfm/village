import './loadEnv';
import express from 'express';
import { setTemporaryDraft, flushJournalDraft, savePermanentEntry } from './journalService';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'journaling-service', ok: true }));

// TEMPORARY: write to volatile Redis, then purge on submit (no DB persistence).
app.put('/youth/:youthId/draft', async (req, res) => {
  await setTemporaryDraft(req.params.youthId, req.body.text ?? '');
  res.json({ ok: true, volatile: true });
});
app.post('/youth/:youthId/draft/submit', async (req, res) => {
  await flushJournalDraft(req.params.youthId); // vanish — nothing saved
  res.json({ ok: true, flushed: true });
});

// PERMANENT: encrypt + persist to Postgres.
app.post('/youth/:youthId/entries', async (req, res) => {
  const receipt = await savePermanentEntry(req.params.youthId, req.body.body ?? '');
  res.status(201).json(receipt);
});

const port = Number(process.env.PORT) || 4003;
app.listen(port, () => console.log(`[journaling-service] listening on :${port}`));
