import './loadEnv';
import express from 'express';
import cors from 'cors';
import {
  setTemporaryDraft,
  flushJournalDraft,
  savePermanentEntry,
  listEntries,
} from './journalService';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'journaling-service', ok: true }));

// TEMPORARY: volatile in-memory draft — purged on flush, never persisted.
app.put('/youth/:youthId/draft', (req, res) => {
  setTemporaryDraft(req.params.youthId, req.body.text ?? '');
  res.json({ ok: true, volatile: true });
});

app.post('/youth/:youthId/draft/submit', (req, res) => {
  flushJournalDraft(req.params.youthId);
  res.json({ ok: true, flushed: true });
});

// PERMANENT: encrypt + write to local JSON store.
app.post('/youth/:youthId/entries', async (req, res) => {
  const body = req.body.body ?? '';
  if (!body.trim()) {
    return res.status(400).json({ error: 'body is required' });
  }
  try {
    const receipt = await savePermanentEntry(req.params.youthId, body);
    res.status(201).json(receipt);
  } catch (err: any) {
    console.error('[journaling-service] save error:', err?.message);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// LIST: return all permanent entries for a youth (decrypted).
app.get('/youth/:youthId/entries', async (req, res) => {
  try {
    const entries = await listEntries(req.params.youthId);
    res.json({ entries });
  } catch (err: any) {
    console.error('[journaling-service] list error:', err?.message);
    res.status(500).json({ error: 'Failed to load entries' });
  }
});

const port = Number(process.env.PORT) || 4003;
app.listen(port, () => console.log(`[journaling-service] listening on :${port}`));
