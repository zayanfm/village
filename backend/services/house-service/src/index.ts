import './loadEnv';
import express from 'express';
import cors from 'cors';
import { connect } from './db';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'house-service', ok: true }));

// ── House design (stub, in-memory) ──────────────────────────────────────────
// Keyed by youthId. Replace with Mongo-backed house_designs / interiors once the
// DB layer is wired; the route contract stays the same.
const houses: Record<string, object> = {};

app.get('/youth/:youthId/house', (req, res) => {
  const house = houses[req.params.youthId] ?? { walls: 'oak', roof: 'thatch', plants: [] };
  res.json({ youthId: req.params.youthId, house });
});

app.put('/youth/:youthId/house', (req, res) => {
  houses[req.params.youthId] = req.body ?? {};
  res.json({ ok: true, youthId: req.params.youthId, house: houses[req.params.youthId] });
});

const port = Number(process.env.PORT) || 4002;

// Listen immediately so stub routes are reachable; attempt the Mongo connection
// in the background and log (don't crash) if it isn't up yet.
app.listen(port, () => console.log(`[house-service] listening on :${port}`));
connect().catch((e) =>
  console.warn(`[house-service] ⚠ MongoDB not connected (stub routes still served): ${e.message}`)
);
