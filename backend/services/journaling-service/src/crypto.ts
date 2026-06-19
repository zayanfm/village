import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

// Use env key if provided (production), otherwise a fixed demo key.
// The demo key is intentionally public — for real deployment set ENCRYPTION_KEY
// to 64 random hex chars in your .env file.
const DEMO_KEY = 'a'.repeat(64); // 32 zero-like bytes — fine for demo only

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || DEMO_KEY;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    console.warn('[crypto] ENCRYPTION_KEY invalid length, falling back to demo key');
    return Buffer.from(DEMO_KEY, 'hex');
  }
  return buf;
}

export function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decrypt(blob: Buffer): string {
  try {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const enc = blob.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '[unreadable]';
  }
}
