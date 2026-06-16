import './loadEnv';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'user-service', ok: true }));

// ── Auth (stub) ──────────────────────────────────────────────────────────────
// Mints a mock JWT-shaped token + persona. Real claim-minting (persona/roles/
// scopes/rel) and password verification land here later; the shape is stable so
// the frontend can integrate against it now.
app.post('/auth/login', (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email is required' });
  res.json({
    token: 'stub.jwt.token',
    user: {
      id: '00000000-0000-0000-0000-000000000008',
      email,
      persona: 'youth',
      roles: ['youth'],
    },
  });
});

// ── Profile (stub) ───────────────────────────────────────────────────────────
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, displayName: 'Hana M.', persona: 'youth' });
});

const port = Number(process.env.PORT) || 4001;
app.listen(port, () => console.log(`[user-service] listening on :${port}`));
