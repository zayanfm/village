/**
 * EphemeralDataScrubContext.js — Client-side PDPA anonymization engine.
 *
 * PURPOSE
 * -------
 * All raw chat lines imported from WhatsApp or Telegram pass through this
 * module before they touch any React state or UI surface. The engine operates
 * entirely in local runtime memory — no data is written to disk, network, or
 * AsyncStorage at any point during or after scrubbing.
 *
 * WHAT IS STRIPPED
 * ----------------
 *  • Singapore mobile phone numbers  (8-digit strings starting with 6, 8, or 9)
 *  • NRIC / FIN identifiers           ([S|T|F|G] + 7 digits + capital letter)
 *  • Sender / participant names       extracted from WhatsApp, Telegram, and
 *                                     plain-text chat header formats, then
 *                                     replaced with stable [USER_A] … [USER_Z]
 *                                     tokens that are consistent across the
 *                                     entire transcript.
 *
 * TOKEN CONTRACT
 * --------------
 * Each unique real name discovered in the transcript is mapped to exactly one
 * [USER_X] token for the lifetime of that import session. The mapping lives
 * only in the returned `nameTable` object; it is discarded by flushState().
 *
 * USAGE
 * -----
 *   import { anonymizeLines } from './EphemeralDataScrubContext';
 *
 *   const { scrubbedLines, nameTable, stats } = anonymizeLines(rawLines);
 *   // rawLines  → never stored in React state
 *   // scrubbedLines → safe to store in rawTextLines volatile buffer
 */

/* ─────────────────────────── Regex patterns ─────────────────────────── */

/**
 * Singapore mobile: 8 digits starting with 6, 8, or 9.
 * Matches standalone numbers (word boundary on both sides) to avoid false
 * positives inside longer numeric strings (e.g. years, postal codes).
 */
const PHONE_RE = /\b[689]\d{7}\b/g;

/**
 * Singapore NRIC / FIN: letter prefix [S|T|F|G], 7 digits, capital-letter checksum.
 * Case-insensitive prefix to catch lowercase input in informal chats.
 */
const NRIC_RE = /\b[STFGstfg]\d{7}[A-Z]\b/g;

/**
 * WhatsApp export header (both 12-h and 24-h clock variants):
 *   "12/06/2026, 14:32 - John Tan: hello"
 *   "6/6/26, 2:32 pm - Sarah: hi"
 */
const WA_HEADER_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?:\s*[ap]m)?\s*-\s*([^:]+):/i;

/**
 * Telegram export header:
 *   "John Tan [14 Jun 2026 at 14:32]:"
 *   "Sarah [10:22]:"
 */
const TG_HEADER_RE = /^([^[]+)\s*\[[\d\w\s:at,]+\]:/i;

/**
 * Plain / generic header (used in the prototype mock transcripts):
 *   "Youth: message text"
 *   "Volunteer: message text"
 *   "John: hey"
 */
const PLAIN_HEADER_RE = /^([A-Za-z][A-Za-z\s.'-]{0,39}):\s/;

/* ─────────────────────────── Name-token helpers ─────────────────────────── */

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Assign or retrieve the stable [USER_X] token for a discovered real name. */
function getOrAssignToken(name, nameTable) {
  const key = name.trim().toLowerCase();
  if (nameTable[key]) return nameTable[key];
  const idx = Object.keys(nameTable).length;
  const letter = TOKEN_ALPHABET[idx % TOKEN_ALPHABET.length] ?? String(idx);
  const token = `[USER_${letter}]`;
  nameTable[key] = token; // eslint-disable-line no-param-reassign
  return token;
}

/**
 * Extract the sender name from a line using any of the three known formats.
 * Returns null if no header pattern matched.
 */
function extractSenderName(line) {
  const waMatch = line.match(WA_HEADER_RE);
  if (waMatch) return waMatch[1].trim();

  const tgMatch = line.match(TG_HEADER_RE);
  if (tgMatch) return tgMatch[1].trim();

  const plainMatch = line.match(PLAIN_HEADER_RE);
  if (plainMatch) return plainMatch[1].trim();

  return null;
}

/* ─────────────────────────── Core scrub function ─────────────────────────── */

/**
 * Anonymize a single line of raw text.
 *
 * Replacements applied in order:
 *  1. NRIC / FIN   → [NRIC_REDACTED]
 *  2. Phone numbers → [PHONE_REDACTED]
 *  3. Real names   → [USER_X] tokens  (supplied via pre-built nameTable)
 *
 * @param {string} raw - original line
 * @param {Record<string,string>} nameTable - name→token map (mutated in-place)
 * @returns {string} scrubbed line
 */
function scrubLine(raw, nameTable) {
  let line = raw;

  // 1. NRIC / FIN
  line = line.replace(NRIC_RE, '[NRIC_REDACTED]');

  // 2. Phone numbers
  line = line.replace(PHONE_RE, '[PHONE_REDACTED]');

  // 3. Named tokens — replace every known real name with its stable token.
  //    Iterate from longest name to shortest to avoid partial-match collisions
  //    (e.g. "John Tan" before "John").
  const sortedNames = Object.keys(nameTable).sort((a, b) => b.length - a.length);
  for (const nameLower of sortedNames) {
    const token = nameTable[nameLower];
    // Build a case-insensitive word-boundary regex for each name.
    // Names may contain spaces so we can't rely on \b alone — use lookahead /
    // lookbehind for non-word chars instead.
    const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'gi');
    line = line.replace(re, token);
  }

  return line;
}

/* ─────────────────────────── Public API ─────────────────────────── */

/**
 * Run the full two-pass anonymization pipeline over an array of raw chat lines.
 *
 * Pass 1 — build name table:
 *   Scan every line for sender-name headers; assign stable [USER_X] tokens.
 *
 * Pass 2 — scrub every line:
 *   Apply NRIC, phone, and name replacements.
 *
 * @param {string[]} rawLines
 * @returns {{
 *   scrubbedLines: string[],
 *   nameTable: Record<string, string>,
 *   stats: { linesProcessed: number, replacements: { nric: number, phone: number, name: number } }
 * }}
 */
export function anonymizeLines(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { scrubbedLines: [], nameTable: {}, stats: { linesProcessed: 0, replacements: { nric: 0, phone: 0, name: 0 } } };
  }

  /** @type {Record<string,string>} nameLower → [USER_X] */
  const nameTable = {};

  // ── Pass 1: discover all sender names ──────────────────────────────────────
  for (const line of rawLines) {
    const name = extractSenderName(line);
    if (name) getOrAssignToken(name, nameTable);
  }

  // ── Pass 2: scrub every line and track replacement counts ─────────────────
  let nricCount = 0;
  let phoneCount = 0;
  let nameCount = 0;

  const scrubbedLines = rawLines.map((raw) => {
    // Use inline (non-sticky) regexes for counting so module-level lastIndex
    // state is never advanced during the stats pass.
    nricCount += (raw.match(/\b[STFGstfg]\d{7}[A-Z]\b/g) ?? []).length;
    phoneCount += (raw.match(/\b[689]\d{7}\b/g) ?? []).length;

    const sortedNames = Object.keys(nameTable).sort((a, b) => b.length - a.length);
    for (const nameLower of sortedNames) {
      const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'gi');
      nameCount += (raw.match(re) ?? []).length;
    }

    return scrubLine(raw, nameTable);
  });

  return {
    scrubbedLines,
    nameTable,
    stats: {
      linesProcessed: rawLines.length,
      replacements: { nric: nricCount, phone: phoneCount, name: nameCount },
    },
  };
}

/**
 * Convenience wrapper — anonymize a single string (e.g. for testing one line).
 * Builds a throwaway nameTable from that single line.
 */
export function anonymizeChatText(rawText) {
  const { scrubbedLines } = anonymizeLines([rawText]);
  return scrubbedLines[0] ?? '';
}

export default { anonymizeLines, anonymizeChatText };
