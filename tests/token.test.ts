import { describe, expect, it } from "vitest";
import { generateToken, hashToken, looksLikeToken, TOKEN_PREFIX } from "../src/auth/index.js";

describe("generateToken", () => {
  it("makes a prefixed token of the expected shape", () => {
    const token = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token).toHaveLength(TOKEN_PREFIX.length + 43);
    expect(looksLikeToken(token)).toBe(true);
  });

  it("makes a different token every time", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(tokens.size).toBe(1000);
  });
});

describe("looksLikeToken", () => {
  const valid = `rzn_${"A".repeat(43)}`;

  it("accepts the token shape, including the base64url characters - and _", () => {
    expect(looksLikeToken(valid)).toBe(true);
    expect(looksLikeToken(`rzn_${"-_".repeat(21)}x`)).toBe(true);
  });

  it("rejects the wrong prefix, length, characters, padding and whitespace", () => {
    for (const bad of [
      "",
      "rzn_",
      `rzx_${"A".repeat(43)}`,
      `rzn_${"A".repeat(42)}`,
      `rzn_${"A".repeat(44)}`,
      `rzn_${"A".repeat(42)}=`,
      `rzn_${"A".repeat(42)}+`,
      ` ${valid}`,
      `${valid}\n`,
      valid.toLowerCase().replace("rzn_", "RZN_"),
    ]) {
      expect(looksLikeToken(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("hashToken", () => {
  it("is the lowercase hex SHA-256 of the token", () => {
    // SHA-256 of "abc", a published test vector.
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable, and gives different hashes for different tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
