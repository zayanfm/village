import { baseUrl } from './config';
import { http } from './httpClient';

const BASE = baseUrl('ai');
const WORKER_HEADERS = { 'x-worker-role': 'true' };

/**
 * Fetch the latest stored summary for a youth.
 * @param {string} youthId
 */
export function getSummary(youthId) {
  return http.get(`${BASE}/summary/${encodeURIComponent(youthId)}`, {
    headers: WORKER_HEADERS,
    timeoutMs: 15000,
  });
}

/**
 * Generate (or regenerate) a summary and store it.
 * @param {string} youthId
 */
export function generateSummary(youthId) {
  return http.post(`${BASE}/summary/${encodeURIComponent(youthId)}`, {}, {
    headers: WORKER_HEADERS,
    timeoutMs: 60000,
  });
}

/**
 * Save worker-edited summary fields back to the case file.
 * @param {string} youthId
 * @param {{ summary?: string, actionItems?: string[], riskLevel?: string, riskReason?: string }} edits
 */
export function saveSummary(youthId, edits) {
  return http.patch(`${BASE}/summary/${encodeURIComponent(youthId)}`, edits, {
    headers: WORKER_HEADERS,
    timeoutMs: 15000,
  });
}

/**
 * Summarise anonymised imported chat lines into a structured case note preview.
 * @param {string[]} lines  — already anonymised lines from the import pipeline
 */
export function summarizeImport(lines) {
  return http.post(`${BASE}/summarize-import`, { lines }, {
    headers: WORKER_HEADERS,
    timeoutMs: 30000,
  });
}
