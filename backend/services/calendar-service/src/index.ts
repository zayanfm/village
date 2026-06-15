import './loadEnv';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'calendar-service', ok: true }));

const port = Number(process.env.PORT) || 4005;
app.listen(port, () => console.log(`[calendar-service] listening on :${port}`));
