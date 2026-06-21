/**
 * chatFileParser.js — Parses real WhatsApp and Telegram chat exports into
 * normalized lines for the anonymization pipeline.
 *
 * WhatsApp exports a .zip containing "_chat.txt" (and optional media files).
 * Telegram Desktop exports a .json file (mobile has no export feature).
 * Telegram mobile fallback: plain text pasted directly by the worker.
 */

import JSZip from 'jszip';
import { File } from 'expo-file-system/next';

/* ── WhatsApp .txt parser ────────────────────────────────────── */

// Handles both real WhatsApp export formats:
//   [15/5/24, 12:06:55 PM] Name: message      ← bracket format (iOS / most Android)
//   15/5/24, 12:06 - Name: message             ← dash format (older Android)
// Also strips the invisible LEFT-TO-RIGHT MARK (U+200E) WhatsApp prepends on some lines.
const WA_BRACKET_RE = /^‎?\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*/i;
const WA_DASH_RE    = /^‎?\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*-\s*/i;

const SYSTEM_MSG_RE = /^(Messages and calls are end-to-end|.+? omitted$|.+? changed .+?$)/i;

export function parseWhatsApp(rawText) {
  // Normalise line endings and strip BOM
  const lines = rawText.replace(/^﻿/, '').split(/\r?\n/);
  const result = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const isBracket = WA_BRACKET_RE.test(line);
    const isDash    = WA_DASH_RE.test(line);

    if (isBracket || isDash) {
      if (current && !SYSTEM_MSG_RE.test(current)) result.push(current);
      const body = line
        .replace(WA_BRACKET_RE, '')
        .replace(WA_DASH_RE, '')
        .replace(/^‎/, '')  // strip any remaining RTL mark
        .trim();
      current = body;
    } else if (current) {
      current += ' ' + line;
    }
  }
  if (current && !SYSTEM_MSG_RE.test(current)) result.push(current);
  return result.filter((l) => l.length > 1);
}

/* ── WhatsApp .zip extractor ─────────────────────────────────── */

/**
 * Read a WhatsApp export .zip from the device, extract the _chat.txt inside,
 * and return parsed message lines.
 *
 * @param {string} fileUri  local URI from expo-document-picker
 * @returns {Promise<{ lines: string[], fileName: string }>}
 */
export async function extractWhatsAppZip(fileUri) {
  const bytes = await new File(fileUri).bytes();
  const zip = await JSZip.loadAsync(bytes);

  // Find the chat text file — WhatsApp names it "_chat.txt" or "WhatsApp Chat*.txt"
  const txtFile = Object.values(zip.files).find(
    (f) => !f.dir && (f.name.endsWith('_chat.txt') || f.name.match(/\.txt$/i))
  );

  if (!txtFile) {
    throw new Error(
      'No chat text found inside the zip. Make sure you exported "Without media" from WhatsApp.'
    );
  }

  const rawText = await txtFile.async('string');
  const lines = parseWhatsApp(rawText);

  if (lines.length === 0) {
    throw new Error('The chat file is empty or in an unrecognised format.');
  }

  return { lines, fileName: txtFile.name };
}

/* ── Telegram .json parser ───────────────────────────────────── */

function telegramTextToString(text) {
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) {
    return text.map((t) => (typeof t === 'string' ? t : t.text ?? '')).join('');
  }
  return '';
}

export function parseTelegram(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Not a valid Telegram JSON export.');
  }

  const messages = parsed?.messages ?? parsed?.chats?.list?.[0]?.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('No messages found. Export the chat as JSON from Telegram Desktop.');
  }

  return messages
    .filter((m) => m.type === 'message' && m.from && m.text)
    .map((m) => {
      const date = m.date ? new Date(m.date).toLocaleString('en-SG') : '';
      return `${m.from} [${date}]: ${telegramTextToString(m.text)}`;
    })
    .filter((l) => l.length > 5);
}

/* ── Plain-text paste parser (Telegram mobile fallback) ──────── */

/**
 * Treat any pasted block of text as individual lines — used when the worker
 * copies and pastes messages manually from Telegram mobile.
 */
export function parsePastedText(rawText) {
  return rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2);
}
