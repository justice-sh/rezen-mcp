import { createHash, randomBytes } from "node:crypto";

/** Every token starts with this, so a leaked one is easy to recognise and to scan for. */
export const TOKEN_PREFIX = "rzn_";

/** 32 random bytes, base64url-encoded without padding, is 43 characters. */
const TOKEN_PATTERN = /^rzn_[A-Za-z0-9_-]{43}$/;

/**
 * Makes a new token: the prefix and 256 bits from the system's random source.
 * The token carries no meaning (no school, no date), so it reveals nothing if
 * it is seen, and cannot be guessed.
 */
export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** True if the text has the shape of a token. It says nothing about whether the token is valid. */
export function looksLikeToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * The lowercase hex SHA-256 of a token: the only form that is ever stored (ADR-020).
 * A fast hash is right here, because a token is 256 random bits and cannot be
 * guessed; the slow hashes made for passwords add cost and no safety.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
