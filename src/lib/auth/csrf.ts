// Stateless CSRF synchronizer token — ported from the old app's
// src/csrf.js. Deliberately NOT a DB table: the token is just
// HMAC-SHA256(secret, identity), recomputed and compared on every
// mutating request. identity = the session token when logged in, or a
// dedicated anonymous cookie for the one pre-login form (login itself).
//
// This is not an XSS defense — only defends against a different origin
// forging a request via ambient cookies (same scope as the old app's).
import crypto from 'node:crypto';

function resolveSecret(): Buffer {
  const envSecret = process.env.CSRF_SECRET;
  if (envSecret) {
    if (envSecret.length < 32) {
      throw new Error('CSRF_SECRET must be at least 32 bytes (hex-encoded recommended).');
    }
    return Buffer.from(envSecret, 'utf8');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CSRF_SECRET is required in production.');
  }
  // Dev/test fallback: ephemeral per-process secret. Fine — just
  // invalidates in-flight forms on restart, same tradeoff as the old app.
  if (!globalThis.__LMS_DEV_CSRF_SECRET__) {
    globalThis.__LMS_DEV_CSRF_SECRET__ = crypto.randomBytes(32);
  }
  return globalThis.__LMS_DEV_CSRF_SECRET__;
}

declare global {
  // eslint-disable-next-line no-var
  var __LMS_DEV_CSRF_SECRET__: Buffer | undefined;
}

export function csrfToken(identity: string): string {
  return crypto.createHmac('sha256', resolveSecret()).update(identity).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyCsrf(identity: string, submittedToken: unknown): boolean {
  if (typeof submittedToken !== 'string' || submittedToken.length === 0 || submittedToken.length > 512) {
    return false;
  }
  return safeEqual(csrfToken(identity), submittedToken);
}
