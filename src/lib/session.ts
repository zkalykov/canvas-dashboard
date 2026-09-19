import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// SESSION_SECRET must be set in production. Without it a random key is used,
// which logs everyone out whenever the server restarts.
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[Session] SESSION_SECRET is not set; sessions will not survive a restart.');
}
const RAW_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

// Derive exactly 32 bytes for AES-256 from a secret of any length.
const SECRET_KEY = createHash('sha256').update(RAW_SECRET).digest();

export function encryptPayload(payload: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Format: iv:authTag:encryptedData
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

export function decryptPayload(encryptedPayload: string): string | null {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return null;

    const [ivBase64, authTagBase64, encryptedData] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // Expired key, tampered cookie or old format: treat as logged out.
    return null;
  }
}
