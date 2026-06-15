import './loadEnv';
import express from 'express';
import { connect } from './db';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'house-service', ok: true }));

const port = Number(process.env.PORT) || 4002;
connect()
  .then(() => app.listen(port, () => console.log(`[house-service] listening on :${port}`)))
  .catch((e) => {
    console.error('[house-service] ❌ failed to connect to MongoDB:', e.message);
    process.exit(1);
  });
