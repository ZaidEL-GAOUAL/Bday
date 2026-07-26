// signing.ts — HMAC-signed, time-limited media URLs.
//
// Why this exists: Convex's ctx.storage.getUrl() returns a link that works
// forever for anyone who has it and cannot be revoked without deleting the
// file. The old Supabase setup used a private bucket + 1-hour signed URLs, so
// we reproduce that here: media is served through an authenticated HTTP action
// (convex/http.ts) that only accepts a token we minted.
//
// Tokens are `<expiresAtMs>.<hmacHex>` — the same shape a Supabase signed URL
// query param had, so the client's signedUrlFor() barely changes.

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secret(): string {
  const s = process.env.MEDIA_URL_SECRET;
  if (!s) {
    throw new Error(
      "MEDIA_URL_SECRET is not set. Run: npx convex env set MEDIA_URL_SECRET \"$(openssl rand -hex 32)\"",
    );
  }
  return s;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Constant-time string compare — avoids leaking the signature byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signMediaToken(
  mediaId: string,
  expiresAt: number,
): Promise<string> {
  return `${expiresAt}.${await hmac(`${mediaId}.${expiresAt}`)}`;
}

export async function verifyMediaToken(
  mediaId: string,
  token: string | null,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return timingSafeEqual(await signMediaToken(mediaId, expiresAt), token);
}

/** SHA-256 hex. Not used for passcodes — see derivePasscodeHash. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

// ---------------------------------------------------------------------------
// Passcode hashing
//
// PBKDF2-SHA256 at 100k iterations rather than a bare digest. This repo is
// public, so an attacker knows the exact scheme; the only thing standing
// between a leaked hash and the plaintext is how expensive one guess is.
// A bare SHA-256 of a short passcode falls in seconds on a GPU.
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;

function hexToBuffer(hex: string): ArrayBuffer {
  const buffer = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buffer;
}

export function randomSaltHex(): string {
  const buffer = new ArrayBuffer(16);
  crypto.getRandomValues(new Uint8Array(buffer));
  return toHex(buffer);
}

export async function derivePasscodeHash(
  passcode: string,
  saltHex: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBuffer(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(bits);
}

/** Constant-time verify. A group with no salt is unjoinable by design. */
export async function verifyPasscode(
  passcode: string,
  saltHex: string | undefined,
  expectedHash: string,
): Promise<boolean> {
  if (!saltHex) return false;
  return timingSafeEqual(await derivePasscodeHash(passcode, saltHex), expectedHash);
}
