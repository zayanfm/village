import { baseUrl } from './config';

const BASE = baseUrl('ai');

/**
 * Send the full message history to Sprout and get a reply.
 * Pass youthId (firestoreId) to persist messages for worker summaries.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {string|null} youthId
 * @returns {Promise<string>}
 */
export async function sendMessage(messages = [], youthId = null) {
  const body = { messages };
  if (youthId) body.youthId = youthId;

  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data.reply) return data.reply;
    throw new Error(data.error ?? `AI service error ${res.status}`);
  }

  return data.reply ?? '';
}
