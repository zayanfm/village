import { baseUrl } from './config';

const BASE = baseUrl('ai');

/**
 * Send the full message history to Sprout and get a reply.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @returns {Promise<string>}
 */
export async function sendMessage(messages = []) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Backend may send a fallback reply even on 500 — use it if present
    if (data.reply) return data.reply;
    throw new Error(data.error ?? `AI service error ${res.status}`);
  }

  return data.reply ?? '';
}
