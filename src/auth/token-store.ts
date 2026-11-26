import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Database } from "../db/database.js";
import { findSqlError, notMigrated } from "../db/errors.js";
import { schoolTokens } from "../db/schema.js";
import { TokenError } from "./errors.js";
import { generateToken, hashToken, looksLikeToken } from "./token.js";

/** What is known about a token. It never includes the token or its hash. */
export interface TokenRecord {
  readonly id: string;
  readonly schoolId: string;
  readonly label: string | null;
  readonly createdAt: Date;
  /** Set when the token was revoked; null while it works. */
  readonly revokedAt: Date | null;
}

/** A token just issued. `token` is the only copy there will ever be. */
export interface IssuedToken extends TokenRecord {
  readonly token: string;
}

/** The answer to "whose token is this?". */
export interface VerifiedToken {
  readonly tokenId: string;
  readonly schoolId: string;
}

export interface IssueOptions {
  /** A short note for people, at most 100 characters. Not a place for secrets or personal data. */
  readonly label?: string;
}

const MAX_LABEL_LENGTH = 100;

/**
 * Issues, checks and revokes per-school tokens (ADR-020). Later slices use
 * `verify` to learn which school a caller belongs to; nothing else in the
 * server needs to know how tokens are stored.
 */
export interface TokenStore {
  /** Makes a token for a school. The plaintext is in the result and is not stored. */
  issue(schoolId: string, options?: IssueOptions): Promise<IssuedToken>;
  /**
   * The school a token belongs to, or `undefined` if it is malformed, unknown or
   * revoked. Those cases are deliberately not told apart, so a caller learns
   * nothing about tokens that exist.
   */
  verify(token: string): Promise<VerifiedToken | undefined>;
  /** Revokes a token by its id. True if it was active, false if it was unknown or already revoked. */
  revoke(tokenId: string): Promise<boolean>;
  /** Every token, revoked ones included, oldest first; for one school if given. */
  list(schoolId?: string): Promise<TokenRecord[]>;
}

/** Tokens in Postgres, through Drizzle over a `Database`. It does not own the `Database`. */
export class PostgresTokenStore implements TokenStore {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(database: Database) {
    this.db = drizzle(database.sql);
  }

  async issue(schoolId: string, options: IssueOptions = {}): Promise<IssuedToken> {
    const label = cleanLabel(options.label);
    const token = generateToken();
    try {
      const [row] = await this.db
        .insert(schoolTokens)
        .values({ id: randomUUID(), schoolId, tokenHash: hashToken(token), label })
        .returning();
      if (row === undefined) throw new Error("The database did not return the new token.");
      return { token, ...toRecord(row) };
    } catch (error) {
      throw translate(error, schoolId);
    }
  }

  async verify(token: string): Promise<VerifiedToken | undefined> {
    // A malformed value cannot be a token: skip the database.
    if (!looksLikeToken(token)) return undefined;
    try {
      const [row] = await this.db
        .select({ tokenId: schoolTokens.id, schoolId: schoolTokens.schoolId })
        .from(schoolTokens)
        .where(and(eq(schoolTokens.tokenHash, hashToken(token)), isNull(schoolTokens.revokedAt)))
        .limit(1);
      return row;
    } catch (error) {
      throw translate(error);
    }
  }

  async revoke(tokenId: string): Promise<boolean> {
    try {
      const rows = await this.db
        .update(schoolTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schoolTokens.id, tokenId), isNull(schoolTokens.revokedAt)))
        .returning({ id: schoolTokens.id });
      return rows.length > 0;
    } catch (error) {
      throw translate(error);
    }
  }

  async list(schoolId?: string): Promise<TokenRecord[]> {
    try {
      const query = this.db
        .select({
          id: schoolTokens.id,
          schoolId: schoolTokens.schoolId,
          label: schoolTokens.label,
          createdAt: schoolTokens.createdAt,
          revokedAt: schoolTokens.revokedAt,
        })
        .from(schoolTokens);
      const rows = await (
        schoolId === undefined ? query : query.where(eq(schoolTokens.schoolId, schoolId))
      ).orderBy(asc(schoolTokens.createdAt), asc(schoolTokens.id));
      return rows.map(toRecord);
    } catch (error) {
      throw translate(error);
    }
  }
}

function cleanLabel(label: string | undefined): string | null {
  const trimmed = label?.trim();
  if (trimmed === undefined || trimmed === "") return null;
  if (trimmed.length > MAX_LABEL_LENGTH) {
    throw new TokenError(
      "invalid-label",
      `A token label can be at most ${MAX_LABEL_LENGTH} characters; this one has ${trimmed.length}.`,
    );
  }
  return trimmed;
}

function toRecord(row: TokenRecord): TokenRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    label: row.label,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

/** Turns the database's errors into ones that say what to do, without row values. */
function translate(error: unknown, schoolId?: string): unknown {
  if (error instanceof TokenError) return error;
  const sqlError = findSqlError(error);
  if (sqlError?.code === "42P01") return notMigrated(error);
  if (sqlError?.code === "23503" && schoolId !== undefined) {
    return new TokenError("unknown-school", `There is no school with id "${schoolId}".`, {
      cause: error,
    });
  }
  return error;
}
