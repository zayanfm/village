import { baseUrl } from './config';

const BASE = baseUrl('ai');

/**
 * Send a message to the AI companion.
 *
 * @param {string} message - the user's latest message
 * @param {Array<{role: 'user'|'assistant', content: string}>} history - prior turns
 * @returns {Promise<string>} - the assistant's reply
 */
export async function sendMessage(message, history = []) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `AI service error ${res.status}`);
  }

  const data = await res.json();
  return data.reply;
}
