import './loadEnv';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'user-service', ok: true }));

const port = Number(process.env.PORT) || 4001;
app.listen(port, () => console.log(`[user-service] listening on :${port}`));
