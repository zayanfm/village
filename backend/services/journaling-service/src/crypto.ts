import crypto from 'crypto';

// AES-256-GCM application-level encryption for journal bodies. Layout of the
// stored blob: [ 12-byte IV | 16-byte auth tag | ciphertext ].
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars) for AES-256-GCM');
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
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
