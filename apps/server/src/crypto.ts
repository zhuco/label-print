import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

const base64Url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, n, r, p, salt, expected] = encoded.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  try {
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), KEY_LENGTH, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const expectedBuffer = Buffer.from(expected, "base64url");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time verifier for the normalized billing relay webhook. */
export function verifyHmacSha256(payload: string, secret: string, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Compares configuration secrets without leaking a matching prefix through timing. */
export function secureStringEquals(left: string | undefined, right: string | undefined): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

type AccessTokenPayload = { sub: string; exp: number; iat: number; typ: "access" };

export function signAccessToken(userId: string, secret: string, ttlSeconds: number, now = Date.now()): string {
  const payload: AccessTokenPayload = { sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds, typ: "access" };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string, now = Date.now()): string | null {
  const [encoded, signature, unexpected] = token.split(".");
  if (!encoded || !signature || unexpected) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AccessTokenPayload;
    if (payload.typ !== "access" || typeof payload.sub !== "string" || !Number.isInteger(payload.exp)) return null;
    return payload.exp > Math.floor(now / 1000) ? payload.sub : null;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
